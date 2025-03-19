import { BaseIndexingProcessor, IndexingProcessorOptions } from './base.js';
import { PlaintextProcessor } from './plaintext.js';
import { MarkdownProcessor, MarkdownProcessorOptions } from './markdown.js';
import { GitLabMarkdownProcessor, GitLabMarkdownProcessorOptions } from './gitlab-markdown.js';
import { ProcessorRegistry } from './registry.js';
import { ProcessorConfigSet, DEFAULT_PROCESSOR_CONFIG } from './config.js';

// Create and export a singleton processor registry with default configuration
export const processorRegistry = new ProcessorRegistry(DEFAULT_PROCESSOR_CONFIG);

// Re-export all processor classes for external use
export {
  BaseIndexingProcessor,
  MarkdownProcessor,
  GitLabMarkdownProcessor,
  PlaintextProcessor,
  ProcessorRegistry,
  ProcessorConfigSet
};

// Re-export base types
export * from './base.js';
export * from './plaintext.js';
export * from './markdown.js';
export * from './gitlab-markdown.js';
export * from './config.js';
