import { BaseIndexingProcessor, IndexingProcessorOptions } from './base.js';
import { PlaintextProcessor } from './plaintext.js';
import { MarkdownProcessor, MarkdownProcessorOptions } from './markdown.js';
import { minimatch } from 'minimatch';

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
  private collectionConfig: any = null;

  constructor() {
    // Initialize with default processor for plaintext
    this.defaultProcessor = new PlaintextProcessor();

    // Register default processors without configuration
    this.registerDefaults();
  }

  /**
   * Register default processors with standard patterns
   */
  private registerDefaults(): void {
    // Register the markdown processor by default for markdown files
    this.register('**/*.md', new MarkdownProcessor());
    this.register('**/*.markdown', new MarkdownProcessor());
    this.register('**/*.mdx', new MarkdownProcessor());
  }

  /**
   * Set the collection configuration to use for processor options
   * This allows processors to be configured based on collection settings
   *
   * @param config The collection configuration object
   */
  setCollectionConfig(config: any): void {
    this.collectionConfig = config;

    // Clear the registry and re-register processors with the new config
    this.registry = [];

    // Create processors with the collection config
    this.registerProcessorsFromConfig();
  }

  /**
   * Register processors based on the current collection configuration
   */
  private registerProcessorsFromConfig(): void {
    if (!this.collectionConfig) {
      // If no config is set, use defaults
      this.registerDefaults();
      return;
    }

    // Get processor options from the config
    const processorConfig = this.collectionConfig.processors || {};

    // Configure markdown processor if options exist
    if (processorConfig.markdown) {
      const markdownOptions: MarkdownProcessorOptions = {
        debug: processorConfig.markdown.debug || false,
        skipCodeBlocks: processorConfig.markdown.skipCodeBlocks !== undefined
          ? processorConfig.markdown.skipCodeBlocks
          : true,
        skipHtml: processorConfig.markdown.skipHtml !== undefined
          ? processorConfig.markdown.skipHtml
          : true,
        markdown: {
          flavor: processorConfig.markdown.flavor || 'gfm',
          breaks: processorConfig.markdown.options?.breaks,
          pedantic: processorConfig.markdown.options?.pedantic,
          allowHtml: processorConfig.markdown.options?.allowHtml,
          markedOptions: processorConfig.markdown.options?.markedOptions
        }
      };

      // Create processor with the options
      const markdownProcessor = new MarkdownProcessor(markdownOptions);

      // Register for markdown file patterns
      this.register('**/*.md', markdownProcessor);
      this.register('**/*.markdown', markdownProcessor);
      this.register('**/*.mdx', markdownProcessor);
    } else {
      // If no specific config, use defaults
      this.registerDefaults();
    }
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
}

// Export a singleton instance
export const processorRegistry = new ProcessorRegistry();

// Re-export base types
export * from './base.js';
export * from './plaintext.js';
export * from './markdown.js';
