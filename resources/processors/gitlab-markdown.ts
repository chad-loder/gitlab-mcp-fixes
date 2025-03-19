import { MarkdownProcessor, MarkdownProcessorOptions } from './markdown.js';

/**
 * GitLab Markdown Processor options
 * Extends the base markdown processor options with GitLab-specific settings
 */
export interface GitLabMarkdownProcessorOptions extends MarkdownProcessorOptions {
  /**
   * Whether to extract API documentation metadata
   * This includes titles, parameter tables, and endpoint patterns
   */
  extractMetadata?: boolean;
}

/**
 * GitLab Markdown Processor
 *
 * A specialized version of the MarkdownProcessor optimized for GitLab-flavored markdown
 * and API documentation. Extracts metadata during processing for more efficient handling.
 */
export class GitLabMarkdownProcessor extends MarkdownProcessor {
  // Additional properties to store extracted metadata during processing
  private extractedTitle: string = '';
  private extractedParameterData: string = '';
  private extractedEndpointPattern: string | null = null;

  // Track whether metadata was extracted
  private metadataExtracted: boolean = false;

  /**
   * GitLab-specific options
   */
  protected gitlabOptions: GitLabMarkdownProcessorOptions;

  constructor(options: GitLabMarkdownProcessorOptions = {}) {
    // Set GitLab defaults for the base markdown processor
    const gitlabDefaults: GitLabMarkdownProcessorOptions = {
      markdown: {
        flavor: 'glfm', // Default to GitLab Flavored Markdown
        allowHtml: true,
        breaks: false
      },
      extractMetadata: true, // Default to extracting metadata during processing
      ...options
    };

    super(gitlabDefaults);

    this.gitlabOptions = gitlabDefaults;
  }

  /**
   * Process markdown content with GitLab-specific enhancements
   * Extracts metadata during processing to avoid multiple passes
   */
  process(content: string): string {
    if (this.options.debug) {
      console.log(`\n\n==== Processing GitLab markdown file ====`);
    }

    // Reset extracted metadata
    this.resetMetadata();

    // Extract metadata before tokenization if enabled
    if (this.gitlabOptions.extractMetadata) {
      this.extractMetadata(content);
    }

    // Process the content using the base implementation
    const result = super.process(content);

    if (this.options.debug) {
      console.log(`==== Finished processing GitLab markdown ====\n\n`);
    }

    return result;
  }

  /**
   * Process markdown content asynchronously with GitLab-specific enhancements
   */
  async processAsync(content: string): Promise<string> {
    if (this.options.debug) {
      console.log(`\n\n==== Processing GitLab markdown file asynchronously ====`);
    }

    // Reset extracted metadata
    this.resetMetadata();

    // Extract metadata before tokenization if enabled
    if (this.gitlabOptions.extractMetadata) {
      this.extractMetadata(content);
    }

    // Process the content using the base implementation
    const result = await super.processAsync(content);

    if (this.options.debug) {
      console.log(`==== Finished processing GitLab markdown asynchronously ====\n\n`);
    }

    return result;
  }

  /**
   * Extract all metadata in a single pass before tokenization
   * This avoids multiple regex passes over the same content
   */
  private extractMetadata(content: string): void {
    // Extract title
    const h1Match = content.match(/^#\s+(.+?)(?:\r?\n|$)/m);
    if (h1Match) {
      this.extractedTitle = h1Match[1].trim();
    } else {
      const h2Match = content.match(/^##\s+(.+?)(?:\r?\n|$)/m);
      if (h2Match) {
        this.extractedTitle = h2Match[1].trim();
      }
    }

    // Extract parameter tables
    const tableRegex = /\|[^|]*Parameter[^|]*\|[^|]*\|[\s\S]*?(?=\n\n|\n#|\n$)/g;
    const tables = content.match(tableRegex);

    if (tables) {
      this.extractedParameterData = tables.map((table: string) => {
        const rows = table.split('\n');
        // Skip header row and separator row (first two rows of markdown table)
        return rows.slice(2).map((row: string) => {
          // Extract content from cells (split by | and remove leading/trailing |)
          const cells = row.split('|').slice(1, -1).map((cell: string) => cell.trim());
          if (cells.length >= 2) {
            return `${cells[0]} ${cells[1]}`;
          }
          return '';
        }).join(' ');
      }).join(' ');
    }

    // Extract endpoint pattern
    const endpointMatch = content.match(/\b(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(\/[a-zA-Z0-9\/_:.-]+)\b/);
    if (endpointMatch) {
      this.extractedEndpointPattern = `${endpointMatch[1]} ${endpointMatch[2]}`;
    }

    this.metadataExtracted = true;
  }

  /**
   * Reset all extracted metadata
   */
  private resetMetadata(): void {
    this.extractedTitle = '';
    this.extractedParameterData = '';
    this.extractedEndpointPattern = null;
    this.metadataExtracted = false;
  }

  /**
   * Get the extracted title, extracting it on demand if not already extracted
   */
  public getTitle(content: string, resourceId: string = ''): string {
    if (!this.metadataExtracted) {
      this.extractMetadata(content);
    }

    if (this.extractedTitle) {
      return this.extractedTitle;
    }

    // Fallback to a humanized version of the resource ID if no title found
    if (resourceId) {
      const basename = resourceId.split('/').pop() || '';
      return basename.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    }

    return '';
  }

  /**
   * Get the extracted parameter data, extracting it on demand if not already extracted
   */
  public getParameterData(content: string): string {
    if (!this.metadataExtracted) {
      this.extractMetadata(content);
    }

    return this.extractedParameterData;
  }

  /**
   * Get the extracted endpoint pattern, extracting it on demand if not already extracted
   */
  public getEndpointPattern(content: string): string | null {
    if (!this.metadataExtracted) {
      this.extractMetadata(content);
    }

    return this.extractedEndpointPattern;
  }

  /**
   * Override the base extractTitle to use our cached version
   */
  public extractTitle(content: string, resourceId: string = ''): string {
    return this.getTitle(content, resourceId);
  }

  /**
   * Override the base extractParameterData to use our cached version
   */
  public extractParameterData(content: string): string {
    return this.getParameterData(content);
  }

  /**
   * Override the base extractEndpointPattern to use our cached version
   */
  public extractEndpointPattern(content: string): string | null {
    return this.getEndpointPattern(content);
  }
}
