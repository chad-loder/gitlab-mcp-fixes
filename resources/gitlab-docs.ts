import { ResourceCollection } from './index.js';
import { registerGitLabApiDocs } from './gitlab-api-docs.js';
import { registerGitLabCliDocs } from './gitlab-cli-docs.js';

/**
 * GitLab Documentation Module
 *
 * This module serves as a central registration point for all GitLab documentation
 * collections. It provides functions to register and access all available GitLab
 * documentation resources.
 */

// Track all registered collections
const registeredCollections: Map<string, ResourceCollection> = new Map();

/**
 * Register all GitLab documentation collections
 * This makes all GitLab documentation available through the resource system
 *
 * @returns An array of all registered collections
 */
export function registerAllGitLabDocs(): ResourceCollection[] {
  // Register API documentation
  const apiDocs = registerGitLabApiDocs();
  registeredCollections.set(apiDocs.id, apiDocs);

  // Register CLI documentation
  const cliDocs = registerGitLabCliDocs();
  registeredCollections.set(cliDocs.id, cliDocs);

  // Add any future documentation collections here

  return Array.from(registeredCollections.values());
}

/**
 * Get all registered GitLab documentation collections
 *
 * @returns An array of all registered collections
 */
export function getAllGitLabDocs(): ResourceCollection[] {
  // If collections haven't been registered yet, register them now
  if (registeredCollections.size === 0) {
    return registerAllGitLabDocs();
  }

  return Array.from(registeredCollections.values());
}

/**
 * Get a specific GitLab documentation collection by ID
 *
 * @param collectionId The ID of the collection to retrieve
 * @returns The requested collection or undefined if not found
 */
export function getGitLabDocsCollection(collectionId: string): ResourceCollection | undefined {
  // If collections haven't been registered yet, register them now
  if (registeredCollections.size === 0) {
    registerAllGitLabDocs();
  }

  return registeredCollections.get(collectionId);
}

// Automatically register all collections if this file is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  const collections = registerAllGitLabDocs();
  console.log(`Registered ${collections.length} GitLab documentation collections:`);
  collections.forEach(collection => {
    console.log(`- ${collection.id}: ${collection.name}`);
  });
}
