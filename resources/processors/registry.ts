/**
 * Processor Registry
 *
 * A singleton registry that manages processor instances and handles
 * processor selection based on file patterns.
 */

import { minimatch } from 'minimatch';
import { BaseIndexingProcessor } from './base.js';
import { PlaintextProcessor } from './plaintext.js';
import { MarkdownProcessor } from './markdown.js';
import { GitLabMarkdownProcessor } from './gitlab-markdown.js';
import {
  ProcessorConfigSet,
  DEFAULT_PROCESSOR_CONFIG,
  mergeConfig,
  getProcessorOptions,
  PROCESSOR_TYPE_MAP
} from './config.js';

/**
 * Registry entry mapping glob patterns to processors
 */
export interface ProcessorRegistryEntry {
  pattern: string;
  processor: BaseIndexingProcessor;
}

/**
 * Processor Registry
 *
 * Manages content processors and determines which processor
 * to use for each file based on glob patterns.
 */
export class ProcessorRegistry {
  private registry: ProcessorRegistryEntry[] = [];
  private defaultProcessor: BaseIndexingProcessor;
  private config: ProcessorConfigSet = DEFAULT_PROCESSOR_CONFIG;

  constructor(customConfig: Partial<ProcessorConfigSet> = {}) {
    // Initialize with merged configuration
    this.config = mergeConfig(customConfig);

    // Create the default processor
    this.defaultProcessor = new PlaintextProcessor(
      getProcessorOptions(this.config, 'plaintext')
    );

    // Register processors from the initial configuration
    this.registerProcessorsFromConfig();
  }

  /**
   * Register processors based on the current configuration
   */
  private registerProcessorsFromConfig(): void {
    // Clear existing registry
    this.registry = [];

    // Register processors for each pattern in the registry config
    const patternMap = this.config.registry?.patterns || {};

    for (const [pattern, processorType] of Object.entries(patternMap)) {
      // Skip invalid processor types
      if (!processorType || !Object.prototype.hasOwnProperty.call(PROCESSOR_TYPE_MAP, processorType)) {
        continue;
      }

      // Get processor options for this processor type
      const options = getProcessorOptions(this.config, processorType);

      // Create the processor instance based on type
      let processor: BaseIndexingProcessor;

      switch (processorType) {
        case 'markdown':
          processor = new MarkdownProcessor(options);
          break;
        case 'gitlabMarkdown':
          processor = new GitLabMarkdownProcessor(options);
          break;
        case 'plaintext':
        default:
          processor = new PlaintextProcessor(options);
          break;
      }

      // Register the processor with this pattern
      this.register(pattern, processor);
    }
  }

  /**
   * Update the registry configuration
   * @param newConfig New configuration to apply
   */
  updateConfig(newConfig: Partial<ProcessorConfigSet>): void {
    // Merge with existing config
    this.config = mergeConfig(newConfig, this.config);

    // Recreate processors with new config
    this.registerProcessorsFromConfig();
  }

  /**
   * Register a new processor with a glob pattern
   * @param pattern Glob pattern for matching files
   * @param processor The processor to use for matched files
   */
  register(pattern: string, processor: BaseIndexingProcessor): void {
    this.registry.push({ pattern, processor });
  }

  /**
   * Get the appropriate processor for a file
   * @param filePath Path to the file needing processing
   * @returns The processor to use for this file
   */
  getProcessorForFile(filePath: string): BaseIndexingProcessor {
    for (const entry of this.registry) {
      if (minimatch(filePath, entry.pattern)) {
        return entry.processor;
      }
    }
    return this.defaultProcessor;
  }

  /**
   * Process content using the appropriate processor for the file
   * @param filePath Path to the file
   * @param content Raw content to process
   * @returns Processed content ready for indexing
   */
  processContent(filePath: string, content: string): string {
    const processor = this.getProcessorForFile(filePath);
    return processor.process(content);
  }

  /**
   * Process content asynchronously using the appropriate processor for the file
   * @param filePath Path to the file
   * @param content Raw content to process
   * @returns Promise of processed content ready for indexing
   */
  async processContentAsync(filePath: string, content: string): Promise<string> {
    const processor = this.getProcessorForFile(filePath);
    return processor.processAsync(content);
  }

  /**
   * Configure the registry based on a collection configuration
   * Legacy support for old collection config format
   *
   * @param collectionConfig Collection configuration object
   */
  setCollectionConfig(collectionConfig: any): void {
    if (!collectionConfig) {
      return;
    }

    // Convert old config format to new format
    const newConfig: Partial<ProcessorConfigSet> = {
      base: {
        debug: collectionConfig.processors?.debug || false
      }
    };

    // Handle GitLab-specific configuration
    if (collectionConfig.processors?.useGitLabProcessor === true) {
      newConfig.gitlabMarkdown = {
        type: 'gitlabMarkdown',
        debug: collectionConfig.processors?.markdown?.debug || false,
        skipCodeBlocks: collectionConfig.processors?.markdown?.skipCodeBlocks,
        skipHtml: collectionConfig.processors?.markdown?.skipHtml,
        extractMetadata: collectionConfig.processors?.extractMetadata !== undefined
          ? collectionConfig.processors.extractMetadata
          : true,
        flavor: 'glfm',
        options: {
          breaks: collectionConfig.processors?.markdown?.options?.breaks,
          pedantic: collectionConfig.processors?.markdown?.options?.pedantic,
          allowHtml: collectionConfig.processors?.markdown?.options?.allowHtml,
          markedOptions: collectionConfig.processors?.markdown?.options?.markedOptions
        },
        patterns: {
          '**/*.md': 'gitlabMarkdown',
          '**/*.markdown': 'gitlabMarkdown',
          '**/*.mdx': 'gitlabMarkdown'
        }
      };
    }
    // Handle standard markdown configuration
    else if (collectionConfig.processors?.markdown) {
      newConfig.markdown = {
        type: 'markdown',
        debug: collectionConfig.processors.markdown.debug || false,
        skipCodeBlocks: collectionConfig.processors.markdown.skipCodeBlocks,
        skipHtml: collectionConfig.processors.markdown.skipHtml,
        extractMetadata: true,
        flavor: collectionConfig.processors.markdown.flavor || 'gfm',
        options: {
          breaks: collectionConfig.processors.markdown.options?.breaks,
          pedantic: collectionConfig.processors.markdown.options?.pedantic,
          allowHtml: collectionConfig.processors.markdown.options?.allowHtml,
          markedOptions: collectionConfig.processors.markdown.options?.markedOptions
        }
      };
    }

    // Update the registry with the new configuration
    this.updateConfig(newConfig);
  }
}
