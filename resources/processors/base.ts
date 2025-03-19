/**
 * Base Indexing Processor
 *
 * This abstract class defines the interface for all content processors
 * that prepare documents for indexing.
 */

export interface IndexingProcessorOptions {
  // Any global options needed across processors
  stopwords?: Set<string>;
}

export abstract class BaseIndexingProcessor {
  protected options: IndexingProcessorOptions;

  constructor(options: IndexingProcessorOptions = {}) {
    this.options = options;
  }

  /**
   * Process content before indexing
   * @param content The raw content to process
   * @returns Processed content ready for indexing
   */
  abstract process(content: string): string;

  /**
   * Check if this processor can handle the given file
   * @param filePath Path to the file
   * @returns True if this processor can handle the file
   */
  abstract canProcess(filePath: string): boolean;
}
