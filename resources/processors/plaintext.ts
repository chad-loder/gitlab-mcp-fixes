import { BaseIndexingProcessor, IndexingProcessorOptions } from './base.js';
import * as path from 'path';

/**
 * Plaintext Processor
 *
 * A simple processor that leaves content mostly unchanged.
 * This serves as the default processor and a baseline for comparison.
 */
export class PlaintextProcessor extends BaseIndexingProcessor {
  constructor(options: IndexingProcessorOptions = {}) {
    super(options);
  }

  /**
   * Process plaintext content
   * This is essentially a no-op to establish baseline behavior
   */
  process(content: string): string {
    // Add a unique marker to verify the processor is running
    // and distinguish it from the markdown processor
    return content.trim() + "\n<!-- Processed by PlaintextProcessor -->";
  }

  /**
   * Process plaintext content asynchronously
   *
   * @param content The content to process
   * @returns Promise of the processed content
   */
  async processAsync(content: string): Promise<string> {
    // For simple processing, we'll just make it non-blocking
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(this.process(content));
      }, 0);
    });
  }

  /**
   * The plaintext processor can handle any file
   * It serves as the default fallback
   */
  canProcess(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ext === '.txt' || ext === '.text';
  }

  /**
   * Extract title from plaintext content
   * For plaintext, we use the first line as the title
   *
   * @param content The plaintext content
   * @param resourceId Fallback resource ID to use if no title found
   * @returns The extracted title
   */
  extractTitle(content: string, resourceId: string = ''): string {
    // Get the first line that has content
    const lines = content.split('\n');
    const firstLine = lines.find(line => line.trim().length > 0);

    if (firstLine && firstLine.trim().length > 0) {
      // Use the first non-empty line as title (up to 100 characters)
      return firstLine.trim().substring(0, 100);
    }

    // Fallback to resourceId if no title found in content
    if (resourceId) {
      const basename = resourceId.split('/').pop() || '';
      return basename.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    }

    return '';
  }

  /**
   * Extract parameter data from plaintext content
   * Basic implementation that looks for parameter-like patterns
   *
   * @param content The plaintext content
   * @returns String containing parameter names and descriptions
   */
  extractParameterData(content: string): string {
    // Look for patterns like "parameter: value" or "parameter - description"
    const paramRegex = /^([a-zA-Z0-9_]+[a-zA-Z0-9_-]*)\s*[:|-]\s*(.+)$/gm;
    let match;
    let parameters = '';

    while ((match = paramRegex.exec(content)) !== null) {
      if (match[1] && match[2]) {
        parameters += `${match[1]}: ${match[2]} `;
      }
    }

    return parameters.trim();
  }

  /**
   * Extract API endpoint pattern from plaintext content
   * Looks for common REST API patterns in plaintext
   *
   * @param content The plaintext content
   * @returns Extracted endpoint pattern or null if none found
   */
  extractEndpointPattern(content: string): string | null {
    // Try to find REST API endpoint patterns
    const endpointMatch = content.match(/\b(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(\/[a-zA-Z0-9\/_:.-]+)\b/i);

    if (endpointMatch) {
      return `${endpointMatch[1].toUpperCase()} ${endpointMatch[2]}`;
    }

    return null;
  }

  /**
   * Extract a relevant snippet of content around a search query
   *
   * @param content The plaintext content
   * @param query The search query
   * @returns A snippet of content around the query
   */
  extractContentSnippet(content: string, query: string): string {
    // Clean the query for regex safety
    const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Try to find the query in the content
    const regex = new RegExp(`(.{0,100})(${safeQuery})(.{0,100})`, 'i');
    const match = content.match(regex);

    if (match) {
      // Return the context around the match
      return `...${match[1]}${match[2]}${match[3]}...`;
    }

    // If no match, return the beginning of the content
    return content.substring(0, 200) + (content.length > 200 ? '...' : '');
  }
}
