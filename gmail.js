export class GmailAPI {
  constructor() {
    this.baseUrl = 'https://gmail.googleapis.com/gmail/v1';
  }

  async getUnreadEmails(authToken) {
    try {
      // Get list of unread messages
      const listResponse = await fetch(
        `${this.baseUrl}/users/me/messages?q=is:unread`,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!listResponse.ok) {
        throw new Error(`Gmail API error: ${listResponse.status} ${listResponse.statusText}`);
      }

      const listData = await listResponse.json();
      const messages = listData.messages || [];

      // Fetch full message details for each message
      const fullMessages = await Promise.all(
        messages.slice(0, 10).map(msg => this.getMessageDetails(authToken, msg.id))
      );

      return fullMessages.filter(msg => msg !== null);
    } catch (error) {
      console.error('Error fetching unread emails:', error);
      throw error;
    }
  }

  async getMessageDetails(authToken, messageId) {
    try {
      const response = await fetch(
        `${this.baseUrl}/users/me/messages/${messageId}?format=full`,
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        console.error(`Failed to fetch message ${messageId}: ${response.status}`);
        return null;
      }

      const messageData = await response.json();
      return this.parseMessage(messageData);
    } catch (error) {
      console.error(`Error fetching message details for ${messageId}:`, error);
      return null;
    }
  }

  parseMessage(messageData) {
    const headers = messageData.payload?.headers || [];
    
    const getHeader = (name) => {
      const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
      return header ? header.value : '';
    };

    const subject = getHeader('Subject') || '(No Subject)';
    const from = getHeader('From') || '';
    const date = getHeader('Date') || '';
    
    // Parse from field
    const fromMatch = from.match(/^(?:"?([^"]*)"?\s)?(?:<?([^<>@]+@[^<>@]+)>?)/);
    const fromName = fromMatch?.[1] || '';
    const fromEmail = fromMatch?.[2] || from;

    // Extract snippet (already provided by Gmail API)
    const snippet = messageData.snippet || '';

    // Extract full email body
    const body = this.extractEmailBody(messageData.payload);

    return {
      id: messageData.id,
      threadId: messageData.threadId,
      subject,
      snippet,
      body,
      from: {
        name: fromName,
        email: fromEmail
      },
      date,
      internalDate: messageData.internalDate
    };
  }

  extractEmailBody(payload) {
    if (!payload) return '';

    // Handle single part message
    if (payload.mimeType && payload.body?.data) {
      const content = this.decodeBase64(payload.body.data);
      if (payload.mimeType === 'text/plain') {
        return content;
      } else if (payload.mimeType === 'text/html') {
        return this.stripHtml(content);
      }
    }

    // Handle multipart message
    if (payload.parts) {
      // First try to find text/plain
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          return this.decodeBase64(part.body.data);
        }
      }
      
      // Fallback to text/html
      for (const part of payload.parts) {
        if (part.mimeType === 'text/html' && part.body?.data) {
          return this.stripHtml(this.decodeBase64(part.body.data));
        }
      }

      // Recursively check nested parts
      for (const part of payload.parts) {
        const nestedBody = this.extractEmailBody(part);
        if (nestedBody) {
          return nestedBody;
        }
      }
    }

    return '';
  }

  decodeBase64(base64String) {
    try {
      // Gmail uses URL-safe base64 encoding
      const normalized = base64String.replace(/-/g, '+').replace(/_/g, '/');
      return decodeURIComponent(atob(normalized).split('').map(c => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
    } catch (error) {
      console.error('Error decoding base64:', error);
      return '';
    }
  }

  stripHtml(html) {
    try {
      // Remove HTML tags and decode HTML entities
      const temp = document.createElement('div');
      temp.innerHTML = html;
      const text = temp.textContent || temp.innerText || '';
      
      // Clean up extra whitespace and line breaks
      return text
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim();
    } catch (error) {
      console.error('Error stripping HTML:', error);
      return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }
  }
}

export const gmailAPI = new GmailAPI();