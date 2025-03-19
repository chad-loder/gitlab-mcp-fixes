/**
 * Collection Configuration Loader
 * Dynamically loads and validates collection configurations
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

// Define the Collection Configuration interface
export interface CollectionConfig {
  metadata: {
    id: string;
    name: string;
    description: string;
  };
  content: {
    contentRoot: string; // Root directory for content relative to collection root
    includes: string[];
    excludes: string[];
  };
  search: {
    boost: {
      title: number;
      parameterData: number;
      content: number;
      [key: string]: number;
    };
    options: {
      fuzzy: number;
      prefix: boolean;
      combineWith: 'AND' | 'OR';
      [key: string]: any;
    };
    termProcessing: {
      stopwords: {
        common: string[];
        domain: string[];
        highFrequency: string[];
        product?: string[];
        [key: string]: string[] | undefined;
      };
      stemming: {
        enabled: boolean;
        handlePlurals: boolean;
        handleVerbForms: boolean;
        handleCommonSuffixes: boolean;
        [key: string]: boolean;
      };
    };
  };
  functions?: {
    getUrlForFile?: (filePath: string) => string;
    [key: string]: any;
  };
  getContentPath: (collectionPath: string) => string;
  getAllStopwords: () => Set<string>;
  toJSON: () => any;
  extend: (overrides: any) => CollectionConfig;
  [key: string]: any;
}

/**
 * Get the directory path for a given collection
 *
 * @param {string} collectionId - ID of the collection
 * @returns {string} Absolute path to the collection directory
 */
function getCollectionDir(collectionId: string): string {
  const currentFileDir = path.dirname(fileURLToPath(import.meta.url));
  const resourcesDir = path.resolve(currentFileDir, '..');
  return path.join(resourcesDir, collectionId);
}

/**
 * Get the content directory for a collection
 *
 * @param {string} collectionId - ID of the collection
 * @param {CollectionConfig} config - The collection configuration
 * @returns {string} Absolute path to the content directory
 */
export function getContentDir(collectionId: string, config: CollectionConfig): string {
  const collectionDir = getCollectionDir(collectionId);
  return config.getContentPath(collectionDir);
}

/**
 * Load the configuration for a collection
 *
 * @param {string} collectionId - ID of the collection
 * @returns {Promise<CollectionConfig>} The loaded configuration
 */
export async function loadCollectionConfig(collectionId: string): Promise<CollectionConfig> {
  const collectionDir = getCollectionDir(collectionId);
  const configPath = path.join(collectionDir, 'collection.mjs');

  // Check if the collection directory exists
  if (!fs.existsSync(collectionDir)) {
    throw new Error(`Collection directory not found: ${collectionDir}`);
  }

  // Check if the configuration file exists
  if (!fs.existsSync(configPath)) {
    throw new Error(`Collection configuration not found: ${configPath}`);
  }

  try {
    // Use dynamic import for ESM modules
    const require = createRequire(import.meta.url);
    const configModule = require(configPath);
    const config = configModule.default;

    // Validate the configuration
    validateConfig(config);

    return config;
  } catch (error: any) {
    console.error(`Error loading collection configuration: ${error.message}`);
    throw error;
  }
}

/**
 * Validate a collection configuration
 *
 * @param {CollectionConfig} config - The configuration to validate
 * @throws {Error} If the configuration is invalid
 */
function validateConfig(config: CollectionConfig): void {
  // Check for required properties
  if (!config.metadata?.id) {
    throw new Error('Collection configuration must have an ID');
  }

  if (!config.metadata?.name) {
    throw new Error('Collection configuration must have a name');
  }

  if (!config.content?.includes) {
    throw new Error('Collection configuration must specify file includes');
  }

  // Check for required functions
  if (typeof config.getAllStopwords !== 'function') {
    throw new Error('Collection configuration must implement getAllStopwords()');
  }

  if (typeof config.extend !== 'function') {
    throw new Error('Collection configuration must implement extend()');
  }

  if (typeof config.getContentPath !== 'function') {
    throw new Error('Collection configuration must implement getContentPath()');
  }
}

/**
 * Get all available collection IDs
 *
 * @returns {string[]} Array of collection IDs
 */
export function getAvailableCollections(): string[] {
  const currentFileDir = path.dirname(fileURLToPath(import.meta.url));
  const resourcesDir = path.resolve(currentFileDir, '..');

  return fs.readdirSync(resourcesDir)
    .filter(item => {
      const itemPath = path.join(resourcesDir, item);
      const configPath = path.join(itemPath, 'collection.mjs');
      return fs.statSync(itemPath).isDirectory() && fs.existsSync(configPath);
    });
}

/**
 * Load all available collection configurations
 *
 * @returns {Promise<Record<string, CollectionConfig>>} Map of collection IDs to configurations
 */
export async function loadAllCollectionConfigs(): Promise<Record<string, CollectionConfig>> {
  const collections = getAvailableCollections();
  const configs: Record<string, CollectionConfig> = {};

  for (const collectionId of collections) {
    configs[collectionId] = await loadCollectionConfig(collectionId);
  }

  return configs;
}

/**
 * Convert all collection configurations to JSON
 * Useful for debugging or serializing configurations
 *
 * @returns {Promise<Record<string, any>>} Map of collection IDs to JSON configurations
 */
export async function getAllConfigsAsJSON(): Promise<Record<string, any>> {
  const configs = await loadAllCollectionConfigs();
  const jsonConfigs: Record<string, any> = {};

  for (const [id, config] of Object.entries(configs)) {
    jsonConfigs[id] = config.toJSON();
  }

  return jsonConfigs;
}
