import * as https from 'https';
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

export interface JiraTicket {
  key: string;
  summary: string;
  description: string;
  status: string;
  assignee?: string;
  issueType: string;
  url: string;
}

export interface JiraConfig {
  workspaceUrl: string;
  accessToken: string;
  userEmail: string;
}

export class JiraClient {
  private workspaceUrl: string;
  private accessToken: string;
  private userEmail: string;

  constructor(config: JiraConfig) {
    this.workspaceUrl = config.workspaceUrl;
    this.accessToken = config.accessToken;
    this.userEmail = config.userEmail;
  }

  private makeAuthHeader(): string {
    const credentials = `${this.userEmail}:${this.accessToken}`;
    return 'Basic ' + Buffer.from(credentials).toString('base64');
  }

  private async makeRequest(
    method: 'GET' | 'POST',
    endpoint: string,
    body?: any
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.workspaceUrl}/rest/api/3${endpoint}`);
      const postData = body ? JSON.stringify(body) : undefined;

      const options = {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: method,
        headers: {
          'Authorization': this.makeAuthHeader(),
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          ...(postData && { 'Content-Length': Buffer.byteLength(postData) })
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              resolve(data ? JSON.parse(data) : null);
            } else if (res.statusCode === 401) {
              reject(new Error('Jira authentication failed. Please reconfigure.'));
            } else if (res.statusCode === 404) {
              reject(new Error('Jira ticket not found.'));
            } else {
              reject(new Error(`Jira API error: ${data}`));
            }
          } catch (e) {
            reject(new Error(`Failed to parse Jira response: ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(error);
      });

      if (postData) {
        req.write(postData);
      }
      req.end();
    });
  }

  async getTicket(ticketKey: string): Promise<JiraTicket> {
    try {
      const response = await this.makeRequest('GET', `/issue/${ticketKey}`);

      return {
        key: response.key,
        summary: response.fields.summary,
        description: response.fields.description?.content?.[0]?.content?.[0]?.text || 'No description',
        status: response.fields.status.name,
        assignee: response.fields.assignee?.displayName,
        issueType: response.fields.issuetype.name,
        url: `${this.workspaceUrl}/browse/${response.key}`
      };
    } catch (error) {
      Logger.error('Failed to fetch Jira ticket', error as Error);
      throw error;
    }
  }

  async validateConnection(): Promise<boolean> {
    try {
      await this.makeRequest('GET', '/myself');
      return true;
    } catch (error) {
      Logger.error('Jira connection validation failed', error as Error);
      return false;
    }
  }
}
