/**
 * GitLab API Documentation Collection
 *
 * This file creates a ResourceCollection instance for GitLab API documentation.
 */
import baseConfig from '../config/gitlab-api-docs.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Get the directory of this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Collection configuration based on our new type-safe configuration
const collectionConfig = baseConfig;

// Export the collection configuration for external use
export default collectionConfig;
