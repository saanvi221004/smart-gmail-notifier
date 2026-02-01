const AI_PROMPT = `You are an email summarization expert. Your task is to create an extremely concise summary.

STRICT REQUIREMENTS:
- Maximum 2 lines total
- Maximum 35 words total
- NO paragraphs, NO quotes, NO signatures
- NO greetings, NO URLs, NO phone numbers
- NO raw email formatting or repetition

SUMMARY RULES:
- Capture ONLY the core intent/action needed
- Describe what the sender wants the recipient to know or do
- Must be understandable without seeing the subject
- Focus on the main point, not details

CLASSIFICATION:
- Urgent: time-sensitive deadlines, emergencies, critical issues
- Action Required: requests for response, tasks, approvals
- FYI: informational updates, announcements
- No Action Needed: confirmations, general info

RESPONSE FORMAT (exactly this JSON):
{
  "summary": "1-2 line summary under 35 words",
  "tag": "Urgent|Action Required|FYI|No Action Needed"
}

FAILURE CONDITIONS:
If you exceed word limits or include forbidden content, the response will be rejected.`;

export class AIProcessor {
  constructor() {
    this.settings = null;
  }

  async loadSettings() {
    if (!this.settings) {
      const data = await chrome.storage.local.get(['settings']);
      this.settings = data.settings || { aiApiKey: null };
    }
    return this.settings;
  }

  async processEmail(subject, bodySnippet) {
    const settings = await this.loadSettings();
    
    // Use email body for processing, fallback to subject+snippet if body is empty
    const content = bodySnippet || `${subject} ${this.generateRuleBasedSummary('', '')}`;
    
    // Pre-process email body to clean and limit content
    const cleanedContent = this.preprocessEmailBody(content);
    
    if (settings.aiApiKey) {
      return await this.processWithAI(subject, cleanedContent, settings.aiApiKey);
    } else {
      return this.processWithRules(subject, cleanedContent);
    }
  }

  preprocessEmailBody(bodyContent) {
    if (!bodyContent) return '';
    
    let cleaned = bodyContent;
    
    // Remove common email signatures and footers
    const signaturePatterns = [
      /--\s*\n.*?(?=\n\n|\n[A-Z]|\n$)/gs,  // -- followed by signature
      /Best regards,[\s\S]*?$/gi,
      /Regards,[\s\S]*?$/gi,
      /Sincerely,[\s\S]*?$/gi,
      /Thank you,[\s\S]*?$/gi,
      /Thanks,[\s\S]*?$/gi,
      /Sent from my[\s\S]*?$/gi,
      /Get Outlook for[\s\S]*?$/gi,
      /________________________________[\s\S]*?$/gs,  // Email client separators
    ];
    
    signaturePatterns.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '');
    });
    
    // Remove quoted replies and forwarded content
    const replyPatterns = [
      /On .+? wrote:[\s\S]*?$/gi,  // "On [date] [person] wrote:"
      />+.*$/gm,  // Lines starting with > (quoted text)
      /From:.*$/gm,  // From lines in replies
      /-----Original Message-----[\s\S]*?$/gi,  // Outlook replies
      /Forwarded message[\s\S]*?$/gi,  // Gmail forwards
    ];
    
    replyPatterns.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '');
    });
    
    // Remove URLs and phone numbers
    cleaned = cleaned.replace(/https?:\/\/[^\s]+/g, '[URL]');
    cleaned = cleaned.replace(/www\.[^\s]+/g, '[URL]');
    cleaned = cleaned.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]');
    cleaned = cleaned.replace(/\b\d{1,3}[-.]?\d{1,3}[-.]?\d{1,4}[-.]?\d{1,4}\b/g, '[PHONE]');
    
    // Remove excessive whitespace and clean formatting
    cleaned = cleaned
      .replace(/\n\s*\n\s*\n/g, '\n\n')  // Reduce multiple line breaks
      .replace(/\s+/g, ' ')  // Normalize spaces
      .replace(/^\s+|\s+$/g, '')  // Trim
      .replace(/[^\w\s\.\,\!\?\-\:\;\(\)\[\]\"\'\/]/g, '');  // Remove special chars
    
    // Remove greetings and closings
    const greetingPatterns = [
      /^(Hi|Hello|Dear|Hey|Good morning|Good afternoon)[,\s].*?\n/gi,
      /^(Best|Regards|Sincerely|Thanks|Thank you|Cheers)[,\s].*?$/gim,
    ];
    
    greetingPatterns.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '');
    });
    
    // Limit to first 300-500 words (prioritize meaningful content)
    const words = cleaned.split(/\s+/).filter(word => word.length > 0);
    const limitedWords = words.slice(0, 400); // Take first 400 words
    cleaned = limitedWords.join(' ');
    
    // Final cleanup
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    return cleaned;
  }

  async processWithAI(subject, bodyContent, apiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: AI_PROMPT
            },
            {
              role: 'user',
              content: `Email Body:\n${bodyContent}`
            }
          ],
          max_tokens: 100, // Reduced to force conciseness
          temperature: 0.1 // Lower temperature for more consistent output
        })
      });

      if (!response.ok) {
        throw new Error(`AI API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;
      
      if (!content) {
        throw new Error('No content from AI response');
      }

      try {
        const result = JSON.parse(content);
        
        // Validate and enforce summarization rules
        const validatedResult = this.validateAndEnforceSummary(result, bodyContent);
        
        return {
          summary: validatedResult.summary,
          tag: this.validateTag(validatedResult.tag)
        };
      } catch (parseError) {
        console.error('Failed to parse AI response:', parseError);
        return this.processWithRules(subject, bodyContent);
      }
    } catch (error) {
      console.error('AI processing failed, falling back to rules:', error);
      return this.processWithRules(subject, bodyContent);
    }
  }

  validateAndEnforceSummary(aiResult, originalContent) {
    let summary = aiResult.summary || 'Email content received';
    
    // Check word count
    const wordCount = summary.split(/\s+/).filter(word => word.length > 0).length;
    
    // If exceeds word limit, truncate and create proper summary
    if (wordCount > 35) {
      console.warn(`AI summary exceeded word limit (${wordCount} words), truncating...`);
      summary = this.createEmergencySummary(originalContent);
    }
    
    // Check for forbidden content
    const forbiddenPatterns = [
      /https?:\/\/[^\s]+/g,
      /www\.[^\s]+/g,
      /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
      /^--$/gm,
      /^>+/gm,
      /From:.*$/gm,
      /Sent from my.*$/gi
    ];
    
    let hasForbiddenContent = false;
    forbiddenPatterns.forEach(pattern => {
      if (pattern.test(summary)) {
        hasForbiddenContent = true;
      }
    });
    
    if (hasForbiddenContent) {
      console.warn('AI summary contains forbidden content, regenerating...');
      summary = this.createEmergencySummary(originalContent);
    }
    
    // Check if it's just repeating the original content
    if (summary.length > 100 && originalContent.toLowerCase().includes(summary.toLowerCase().substring(0, 50))) {
      console.warn('AI summary appears to repeat original content, regenerating...');
      summary = this.createEmergencySummary(originalContent);
    }
    
    return {
      summary: summary,
      tag: aiResult.tag || 'No Action Needed'
    };
  }

  createEmergencySummary(content) {
    // Emergency fallback when AI fails to follow constraints
    const words = content.split(/\s+/).filter(word => word.length > 0);
    const firstMeaningfulWords = words.slice(0, 15); // Take first 15 words
    
    let summary = firstMeaningfulWords.join(' ');
    
    // Ensure it ends properly and doesn't exceed limits
    if (summary.length > 150) {
      summary = summary.substring(0, 147) + '...';
    }
    
    // Add period if missing
    if (!summary.match(/[.!?]$/)) {
      summary += '.';
    }
    
    return summary;
  }

  processWithRules(subject, bodyContent) {
    const text = bodyContent.toLowerCase();
    
    let tag = 'No Action Needed';
    let summary = this.generateRuleBasedSummaryFromBody(bodyContent);

    // Urgent patterns (focus on body content)
    const urgentPatterns = [
      /urgent|immediate|asap|emergency|critical|deadline/i,
      /payment overdue|account suspended|service terminated/i,
      /security alert|unusual activity|verify your account/i,
      /expires today|due today|last chance|final notice/i
    ];

    // Action Required patterns (focus on body content)
    const actionPatterns = [
      /please|could you|need you|request|require/i,
      /reply|respond|confirm|approve|reject/i,
      /meeting|appointment|schedule|call/i,
      /sign|complete|fill out|submit/i,
      /your response is needed|waiting for your reply/i
    ];

    // FYI patterns (focus on body content)
    const fyiPatterns = [
      /update|announcement|newsletter|report/i,
      /information|fyi|for your information/i,
      /changed|new feature|maintenance/i,
      /this is to inform you|we wanted to let you know/i
    ];

    if (urgentPatterns.some(pattern => pattern.test(text))) {
      tag = 'Urgent';
    } else if (actionPatterns.some(pattern => pattern.test(text))) {
      tag = 'Action Required';
    } else if (fyiPatterns.some(pattern => pattern.test(text))) {
      tag = 'FYI';
    }

    return { summary, tag };
  }

  generateRuleBasedSummaryFromBody(bodyContent) {
    if (!bodyContent || !bodyContent.trim()) {
      return 'Email content received.';
    }
    
    // Get first meaningful sentences, but enforce strict limits
    const sentences = bodyContent.split(/[.!?]+/).filter(s => s.trim().length > 10);
    
    if (sentences.length > 0) {
      let summary = sentences[0].trim();
      
      // Strict word count enforcement
      const words = summary.split(/\s+/).filter(word => word.length > 0);
      
      if (words.length > 25) {
        // Truncate to 25 words and add ellipsis
        summary = words.slice(0, 25).join(' ');
        if (!summary.match(/[.!?]$/)) {
          summary += '...';
        }
      } else if (words.length < 10 && sentences.length > 1) {
        // If too short, add part of second sentence
        const secondSentence = sentences[1].trim();
        const secondWords = secondSentence.split(/\s+/).filter(word => word.length > 0);
        const remainingWords = 25 - words.length;
        
        if (secondWords.length > 0 && remainingWords > 5) {
          summary += ' ' + secondWords.slice(0, Math.min(remainingWords, secondWords.length)).join(' ');
          if (!summary.match(/[.!?]$/)) {
            summary += '.';
          }
        }
      }
      
      // Final validation - ensure under 35 words
      const finalWords = summary.split(/\s+/).filter(word => word.length > 0);
      if (finalWords.length > 35) {
        summary = finalWords.slice(0, 32).join(' ') + '...';
      }
      
      return summary;
    }
    
    // Fallback to first 20 words
    const words = bodyContent.split(/\s+/).filter(word => word.length > 0);
    const summary = words.slice(0, 20).join(' ');
    return summary + (words.length > 20 ? '...' : '.');
  }

  generateRuleBasedSummary(subject, bodySnippet) {
    if (bodySnippet && bodySnippet.trim()) {
      return this.generateRuleBasedSummaryFromBody(bodySnippet);
    } else if (subject && subject.trim()) {
      return `Email regarding: ${subject}`;
    } else {
      return 'New email received';
    }
  }

  validateTag(tag) {
    const validTags = ['Urgent', 'Action Required', 'FYI', 'No Action Needed'];
    return validTags.includes(tag) ? tag : 'No Action Needed';
  }
}

export const aiProcessor = new AIProcessor();