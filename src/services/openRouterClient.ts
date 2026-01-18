import * as https from 'https';
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenRouterClient {
  private apiKey: string;
  private model: string;
  private baseUrl = 'https://openrouter.ai/api/v1';

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    const config = vscode.workspace.getConfiguration('atlasic');
    this.model = model || config.get<string>('aiModel', 'google/gemini-2.0-flash-exp:free');
  }

  async chatCompletion(
    messages: ChatMessage[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      stream?: boolean;
    }
  ): Promise<string> {
    const requestBody = {
      model: this.model,
      messages: messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
      stream: false
    };

    try {
      const response = await this.makeRequest('/chat/completions', requestBody);
      const data = response as ChatCompletionResponse;
      
      if (data.choices && data.choices.length > 0) {
        return data.choices[0].message.content;
      }
      
      throw new Error('No response from API');
    } catch (error) {
      Logger.error('OpenRouter API error', error as Error);
      throw error;
    }
  }

  async streamChatCompletion(
    messages: ChatMessage[],
    onToken: (token: string) => void,
    options?: {
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<void> {
    const requestBody = {
      model: this.model,
      messages: messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4096,
      stream: true
    };

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(requestBody);
      
      const requestOptions = {
        hostname: 'openrouter.ai',
        port: 443,
        path: '/api/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://github.com/atlasic/vscode-extension',
          'X-Title': 'Atlasic VS Code Extension',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(requestOptions, (res) => {
        let buffer = '';

        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') {
                resolve();
                return;
              }

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  onToken(content);
                }
              } catch (e) {
                // Skip invalid JSON chunks
              }
            }
          }
        });

        res.on('end', () => {
          resolve();
        });

        res.on('error', (error) => {
          Logger.error('Stream error', error);
          reject(error);
        });
      });

      req.on('error', (error) => {
        Logger.error('Request error', error);
        reject(error);
      });

      req.write(postData);
      req.end();
    });
  }

  private makeRequest(endpoint: string, body: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(body);
      
      const options = {
        hostname: 'openrouter.ai',
        port: 443,
        path: `/api/v1${endpoint}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://github.com/atlasic/vscode-extension',
          'X-Title': 'Atlasic VS Code Extension',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(parsed);
            } else {
              reject(new Error(`API error: ${parsed.error?.message || data}`));
            }
          } catch (e) {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      req.write(postData);
      req.end();
    });
  }

  getModel(): string {
    return this.model;
  }

  setModel(model: string): void {
    this.model = model;
  }
}
