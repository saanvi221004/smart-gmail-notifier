# Smart Gmail Notifier

A Chrome Extension (Manifest V3) that provides intelligent Gmail notifications with AI-powered summaries and intent classification.

## Features

- **Gmail OAuth Authentication**: Secure authentication using Google Identity API
- **Real-time Email Polling**: Checks for unread emails every 30 seconds
- **AI-Powered Processing**: 
  - Generates neutral, factual summaries from email body content
  - Classifies emails into: Urgent, Action Required, FYI, No Action Needed
- **Smart Notifications**: Shows sender name, body-based summary, and intent classification
- **Rule-based Fallback**: Works without AI API using deterministic pattern matching
- **Duplicate Prevention**: Tracks processed messages to avoid repeat notifications

## Technical Architecture

### Core Components

1. **manifest.json**: Extension configuration with Manifest V3
2. **background.js**: Service worker handling OAuth, polling, and notifications
3. **gmail.js**: Gmail API integration with full email body extraction
4. **ai.js**: AI processing with OpenAI API and rule-based fallback
5. **popup.html/js**: Settings interface and status display

### Email Body Processing

The extension fetches full email content using:
- `format=full` parameter in Gmail API calls
- Base64 decoding for email content
- HTML tag stripping for clean text extraction
- Prioritization of text/plain over text/html content

### AI Processing Flow

1. **Primary**: OpenAI GPT-3.5-turbo for intelligent summarization
2. **Fallback**: Rule-based pattern matching for classification
3. **Content Focus**: Processes email body, not subject lines

## Installation

1. Clone or download this extension folder
2. Open Chrome and navigate to `chrome://extensions`
3. Enable "Developer mode"
4. Click "Load unpacked" and select the extension folder
5. Configure Google OAuth client ID in `manifest.json`

## Configuration

### Required Setup

1. **Google OAuth Client ID**:
   - Create a project in Google Cloud Console
   - Enable Gmail API
   - Create OAuth 2.0 Client ID
   - Replace `YOUR_CLIENT_ID_HERE` in `manifest.json`

2. **OpenAI API Key** (Optional):
   - Open extension popup
   - Enter your OpenAI API key in settings
   - Without API key, extension uses rule-based processing

## Usage

1. **First-time Setup**: Extension will request Gmail authentication
2. **Automatic Processing**: Starts polling for unread emails every 30 seconds
3. **Notifications**: Receive Chrome notifications with:
   - Sender name in title
   - Email body summary (1-2 lines)
   - Intent classification tag
4. **Management**: Use popup to:
   - Start/stop polling
   - View status and statistics
   - Clear processed message history
   - Configure AI settings

## Notification Format

```
Title: New Email from [Sender Name]
Message: [AI-generated summary from email body]
        [Classification: Urgent/Action Required/FYI/No Action Needed]
```

## Security & Privacy

- **Minimal Permissions**: Only requests necessary Gmail read access
- **Local Storage**: All data stored locally in Chrome
- **No External Servers**: Processes emails locally (except optional AI API)
- **Token Management**: Secure OAuth token handling with automatic refresh

## Development

### File Structure
```
smart-gmail-notifier/
├── manifest.json          # Extension configuration
├── background.js          # Service worker
├── gmail.js              # Gmail API integration
├── ai.js                 # AI processing logic
├── popup.html            # Settings interface
├── popup.js              # Popup functionality
├── icons/
│   └── icon128.png       # Extension icon
└── README.md             # This file
```

### Key Functions

- `GmailAPI.extractEmailBody()`: Parses email content from Gmail API
- `AIProcessor.processEmail()`: Handles AI and rule-based processing
- `GmailNotifier.checkForNewEmails()`: Main polling logic
- `GmailNotifier.showNotification()`: Creates Chrome notifications

## Troubleshooting

### Common Issues

1. **Authentication Failed**:
   - Check OAuth client ID in manifest.json
   - Ensure Gmail API is enabled in Google Cloud Console

2. **No Notifications**:
   - Verify extension has necessary permissions
   - Check Chrome notification settings
   - Ensure polling is active in popup

3. **AI Processing Errors**:
   - Verify OpenAI API key is valid
   - Extension will fallback to rule-based processing automatically

### Debugging

- Check Chrome Developer Tools console for extension errors
- Review background service worker logs
- Monitor Gmail API quota usage in Google Cloud Console

## License

This project is provided as-is for educational and development purposes.

## Support

For issues and questions, please refer to the Chrome Developer documentation and Gmail API documentation.
