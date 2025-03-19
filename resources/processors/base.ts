/**
 * Base Processing Options
 */
export interface IndexingProcessorOptions {
  // Base options for all processors
  [key: string]: any;
}

/**
 * Base Indexing Processor
 *
 * This is the base class for all content processors.
 * It defines the interface that all processors must implement.
 */
export abstract class BaseIndexingProcessor {
  protected options: IndexingProcessorOptions;

  constructor(options: IndexingProcessorOptions = {}) {
    this.options = options;
  }

  /**
   * Process content for indexing
   * @param content Raw content to process
   * @returns Processed content ready for indexing
   */
  abstract process(content: string): string;

  /**
   * Process content for indexing asynchronously
   * @param content Raw content to process
   * @returns Promise of processed content ready for indexing
   */
  abstract processAsync(content: string): Promise<string>;

  /**
   * Check if this processor can handle the given file
   * @param filePath Path to the file
   * @returns True if this processor can handle the file
   */
  abstract canProcess(filePath: string): boolean;

  /**
   * Extract the title from content
   * @param content The content to extract from
   * @param resourceId Optional resource ID to use as fallback
   * @returns The extracted title or empty string if none found
   */
  extractTitle(content: string, resourceId: string = ''): string {
    // Default implementation just returns empty string
    // Should be overridden by specific processors
    return '';
  }

  /**
   * Extract parameter data from content
   * @param content The content to extract from
   * @returns String containing parameter names and descriptions or empty string
   */
  extractParameterData(content: string): string {
    // Default implementation just returns empty string
    // Should be overridden by specific processors
    return '';
  }

  /**
   * Extract API endpoint pattern from content
   * @param content The content to extract from
   * @returns Extracted endpoint pattern or null if none found
   */
  extractEndpointPattern(content: string): string | null {
    // Default implementation returns null
    // Should be overridden by specific processors
    return null;
  }

  /**
   * Extract a relevant snippet of content around a search query
   * @param content The content to extract from
   * @param query The search query
   * @returns A snippet of content around the query
   */
  extractContentSnippet(content: string, query: string): string {
    // Default implementation returns beginning of content
    return content.substring(0, 200) + (content.length > 200 ? '...' : '');
  }
}
