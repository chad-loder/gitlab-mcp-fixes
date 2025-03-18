import * as path from 'path';
import { ResourceCollection, registerCollection } from './index.js';

/**
 * GitLab API documentation collection
 * This module contains the GitLab-specific implementation for the API docs collection
 */

// Define the GitLab API docs collection
const GITLAB_API_DOCS: ResourceCollection = {
  id: 'gitlab-api-docs',
  name: 'GitLab API Documentation',
  description: 'Official documentation for GitLab REST API endpoints',
  dirPath: path.join(__dirname, 'gitlab-api-docs'),
  getURLForFile: (filePath: string) => {
    // Extract the filename without extension
    const fileName = path.basename(filePath, path.extname(filePath));

    // Map to the official documentation URL
    return `https://docs.gitlab.com/ee/api/${fileName}.html`;
  }
};

/**
 * Register the GitLab API docs collection with the resource system
 */
export function registerGitLabApiDocs(): void {
  registerCollection(GITLAB_API_DOCS);
}
