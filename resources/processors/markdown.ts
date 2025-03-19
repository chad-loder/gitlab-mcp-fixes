import { BaseIndexingProcessor, IndexingProcessorOptions } from './base.js';
import * as path from 'path';
import { Marked, Token, Tokens, MarkedOptions } from 'marked';

/**
 * Extended options for the Markdown processor
 */
export interface MarkdownProcessorOptions extends IndexingProcessorOptions {
  /**
   * Whether to log token details to console (can be verbose)
   */
  debug?: boolean;

  /**
   * Whether to skip code blocks in the output
   */
  skipCodeBlocks?: boolean;

  /**
   * Whether to skip HTML blocks in the output
   */
  skipHtml?: boolean;

  /**
   * Markdown parsing options passed to Marked.js
   */
  markdown?: {
    /**
     * Flavor of markdown to parse
     * - 'gfm': GitHub Flavored Markdown (default)
     * - 'glfm': GitLab Flavored Markdown
     */
    flavor?: 'gfm' | 'glfm';

    /**
     * Whether to allow HTML in markdown
     */
    allowHtml?: boolean;

    /**
     * Whether to treat line breaks as <br> elements
     */
    breaks?: boolean;

    /**
     * Whether to use pedantic parsing (strict CommonMark)
     */
    pedantic?: boolean;

    /**
     * Additional marked.js options
     */
    markedOptions?: Partial<MarkedOptions>;
  };
}

/**
 * Markdown Processor
 *
 * A processor that uses marked.js to tokenize markdown content
 * and can selectively filter or modify content based on token types.
 */
export class MarkdownProcessor extends BaseIndexingProcessor {
  private marked: Marked;
  protected options: MarkdownProcessorOptions;

  constructor(options: MarkdownProcessorOptions = {}) {
    super(options);

    this.options = {
      debug: false,
      skipCodeBlocks: true,
      skipHtml: true,
      markdown: {
        flavor: 'gfm',
        allowHtml: true,
        breaks: false,
        pedantic: false
      },
      ...options
    };

    // Create a local instance of Marked with configuration
    // This ensures options and extensions remain locally scoped to this processor
    this.marked = new Marked();

    // Configure based on markdown flavor
    if (this.options.markdown?.flavor === 'glfm') {
      // GitLab Flavored Markdown (based on GFM with potential additions)
      this.marked.setOptions({
        gfm: true,
        breaks: this.options.markdown?.breaks ?? false,
        pedantic: this.options.markdown?.pedantic ?? false
      });
    } else {
      // Default to GitHub Flavored Markdown (gfm)
      this.marked.setOptions({
        gfm: true,
        breaks: this.options.markdown?.breaks ?? false,
        pedantic: this.options.markdown?.pedantic ?? false
      });
    }

    // Apply any additional marked options if provided
    if (this.options.markdown?.markedOptions) {
      this.marked.setOptions(this.options.markdown.markedOptions);
    }
  }

  /**
   * Process markdown content by tokenizing and walking through tokens
   */
  process(content: string): string {
    if (this.options.debug) {
      console.log(`\n\n==== Processing markdown file ====`);
    }

    // Parse markdown into tokens using our instance
    const tokens = this.marked.lexer(content);

    // Process tokens with logging
    let result = this.processTokens(tokens);

    if (this.options.debug) {
      console.log(`==== Finished processing markdown ====\n\n`);
    }

    return result;
  }

  /**
   * Process markdown content asynchronously by tokenizing and walking through tokens
   * This leverages Marked's async capabilities
   */
  async processAsync(content: string): Promise<string> {
    if (this.options.debug) {
      console.log(`\n\n==== Processing markdown file asynchronously ====`);
    }

    // Create a local Marked instance for this specific task to ensure thread safety
    // This prevents race conditions when multiple files are processed concurrently
    const safeMarked = new Marked();

    // Configure the local instance with the same options as the shared instance
    if (this.options.markdown?.flavor === 'glfm') {
      safeMarked.setOptions({
        gfm: true,
        breaks: this.options.markdown?.breaks ?? false,
        pedantic: this.options.markdown?.pedantic ?? false
      });
    } else {
      safeMarked.setOptions({
        gfm: true,
        breaks: this.options.markdown?.breaks ?? false,
        pedantic: this.options.markdown?.pedantic ?? false
      });
    }

    // Apply any additional marked options
    if (this.options.markdown?.markedOptions) {
      safeMarked.setOptions(this.options.markdown.markedOptions);
    }

    // Parse markdown asynchronously with the thread-safe instance
    const tokens = safeMarked.lexer(content);

    // We'll make the token processing async
    // This allows the event loop to handle other tasks while processing
    return new Promise((resolve) => {
      // Use setTimeout to make this non-blocking
      setTimeout(() => {
        const result = this.processTokens(tokens);

        if (this.options.debug) {
          console.log(`==== Finished processing markdown asynchronously ====\n\n`);
        }

        resolve(result);
      }, 0);
    });
  }

  /**
   * Process tokens recursively and log information about them
   */
  private processTokens(tokens: Token[]): string {
    let result = '';

    for (const token of tokens) {
      // Log token information if debug is enabled
      if (this.options.debug) {
        console.log(`Token Type: ${token.type}`);
      }

      // Handle different token types
      switch (token.type) {
        // Block-level tokens
        case 'heading':
          const headingToken = token as Tokens.Heading;
          if (this.options.debug) {
            console.log(`  Heading (Level ${headingToken.depth}): ${headingToken.text}`);
          }
          result += `${headingToken.text}\n\n`;
          break;

        case 'paragraph':
          const paragraphToken = token as Tokens.Paragraph;
          if (this.options.debug) {
            console.log(`  Paragraph: ${paragraphToken.text.substring(0, 40)}${paragraphToken.text.length > 40 ? '...' : ''}`);
          }
          result += `${paragraphToken.text}\n\n`;
          break;

        case 'code':
          const codeToken = token as Tokens.Code;
          if (this.options.debug) {
            console.log(`  Code Block (${codeToken.lang || 'no language'}): ${codeToken.text.substring(0, 40)}${codeToken.text.length > 40 ? '...' : ''}`);
          }
          // Skip code blocks if configured to do so
          if (!this.options.skipCodeBlocks) {
            result += `${codeToken.text}\n\n`;
          } else if (this.options.debug) {
            console.log('  Skipping code block for indexing');
          }
          break;

        case 'blockquote':
          const blockquoteToken = token as Tokens.Blockquote;
          if (this.options.debug) {
            console.log(`  Blockquote`);
          }
          if (blockquoteToken.tokens) {
            const innerContent = this.processTokens(blockquoteToken.tokens);
            result += `${innerContent}\n\n`;
          }
          break;

        case 'list':
          const listToken = token as Tokens.List;
          if (this.options.debug) {
            console.log(`  List (${listToken.ordered ? 'ordered' : 'unordered'})`);
          }
          if (listToken.items) {
            for (const item of listToken.items) {
              if (this.options.debug) {
                console.log(`    List Item: ${item.text?.substring(0, 40)}${item.text?.length > 40 ? '...' : ''}`);
              }
              if (item.tokens) {
                const itemContent = this.processTokens(item.tokens);
                result += `${itemContent}\n`;
              }
            }
            result += '\n';
          }
          break;

        case 'space':
          result += '\n';
          break;

        case 'hr':
          result += '\n';
          break;

        case 'html':
          const htmlToken = token as Tokens.HTML;
          if (this.options.debug) {
            console.log(`  HTML: ${htmlToken.text.substring(0, 40)}${htmlToken.text.length > 40 ? '...' : ''}`);
          }
          // Skip HTML if configured to do so
          if (!this.options.skipHtml) {
            result += `${htmlToken.text}\n\n`;
          } else if (this.options.debug) {
            console.log('  Skipping HTML for indexing');
          }
          break;

        case 'table':
          const tableToken = token as Tokens.Table;
          if (this.options.debug) {
            console.log(`  Table with ${tableToken.header.length} columns`);
          }

          // Extract text from table headers and cells
          const headerRow = tableToken.header.map(cell => this.processTableCell(cell)).join(' ');
          result += `${headerRow}\n`;

          for (const row of tableToken.rows) {
            const rowText = row.map(cell => this.processTableCell(cell)).join(' ');
            result += `${rowText}\n`;
          }
          result += '\n';
          break;

        case 'def':
          // Definition - usually does not contain user-visible text
          // It's a reference for links and images
          const defToken = token as Tokens.Def;
          if (this.options.debug) {
            console.log(`  Definition: ${defToken.title || defToken.href}`);
          }
          // We typically don't add definition tokens to content
          break;

        case 'lheading':
          // Setext-style heading (underlined with = or -)
          const lheadingToken = token as Tokens.Heading;
          if (this.options.debug) {
            console.log(`  Line Heading (Level ${lheadingToken.depth}): ${lheadingToken.text}`);
          }
          result += `${lheadingToken.text}\n\n`;
          break;

        case 'text':
          // Plain text block - these are rare at the block level
          const textBlockToken = token as Tokens.Text;
          if (this.options.debug) {
            console.log(`  Text Block: ${textBlockToken.text.substring(0, 40)}${textBlockToken.text.length > 40 ? '...' : ''}`);
          }
          result += `${textBlockToken.text}\n\n`;
          break;

        // Inline tokens - these usually appear nested inside block tokens
        case 'escape':
          // Escaped character
          if (this.options.debug) {
            console.log(`  Escaped character`);
          }
          // Handled by parent token's text property
          break;

        case 'link':
          // Link
          const linkToken = token as Tokens.Link;
          if (this.options.debug) {
            console.log(`  Link: ${linkToken.text} -> ${linkToken.href}`);
          }
          // Just include the link text, not the URL
          result += `${linkToken.text} `;
          break;

        case 'image':
          // Image
          const imageToken = token as Tokens.Image;
          if (this.options.debug) {
            console.log(`  Image: ${imageToken.text}`);
          }
          // Include alt text for images
          result += `${imageToken.text} `;
          break;

        case 'strong':
          // Strong emphasis
          const strongToken = token as Tokens.Strong;
          if (this.options.debug) {
            console.log(`  Strong: ${strongToken.text}`);
          }
          result += `${strongToken.text} `;
          break;

        case 'em':
          // Emphasis
          const emToken = token as Tokens.Em;
          if (this.options.debug) {
            console.log(`  Emphasis: ${emToken.text}`);
          }
          result += `${emToken.text} `;
          break;

        case 'codespan':
          // Inline code
          const codespanToken = token as Tokens.Codespan;
          if (this.options.debug) {
            console.log(`  Codespan: ${codespanToken.text}`);
          }
          result += `${codespanToken.text} `;
          break;

        case 'br':
          // Line break
          if (this.options.debug) {
            console.log(`  Line break`);
          }
          result += '\n';
          break;

        case 'del':
          // Deleted text
          const delToken = token as Tokens.Del;
          if (this.options.debug) {
            console.log(`  Deleted text: ${delToken.text}`);
          }
          result += `${delToken.text} `;
          break;

        case 'tag':
          // HTML tag
          const tagToken = token as Tokens.Tag;
          if (this.options.debug) {
            console.log(`  HTML Tag: ${tagToken.text}`);
          }
          // Skip HTML tags by default, same as HTML blocks
          if (!this.options.skipHtml) {
            result += `${tagToken.text} `;
          }
          break;

        case 'reflink':
          // Reference-style link [text][id]
          const reflinkToken = token as Tokens.Link;
          if (this.options.debug) {
            console.log(`  Reference Link: ${reflinkToken.text}`);
          }
          // Include only the link text, not the URL
          result += `${reflinkToken.text} `;
          break;

        case 'emStrong':
          // Combined emphasis and strong
          if (this.options.debug) {
            console.log(`  EmStrong (combined emphasis)`);
          }
          // This is usually processed into em/strong tokens
          // but we'll handle if encountered
          if ('text' in token) {
            result += (token as any).text + ' ';
          }
          break;

        case 'autolink':
          // Automatically linked URL <https://example.com>
          const autolinkToken = token as Tokens.Link;
          if (this.options.debug) {
            console.log(`  Autolink: ${autolinkToken.text} -> ${autolinkToken.href}`);
          }
          // Include the text of the autolink
          result += `${autolinkToken.text} `;
          break;

        case 'url':
          // Raw URL that gets automatically linked
          const urlToken = token as Tokens.Link;
          if (this.options.debug) {
            console.log(`  URL: ${urlToken.href}`);
          }
          // Include the URL text
          result += `${urlToken.text || urlToken.href} `;
          break;

        case 'inlineText':
          // Inline text within a block
          if (this.options.debug) {
            console.log(`  Inline Text`);
          }
          if ('text' in token) {
            result += (token as any).text + ' ';
          }
          break;

        default:
          if (this.options.debug) {
            console.log(`  Unhandled token type: ${token.type}`, token);
          }
          // For unknown tokens, include their raw text if available
          if ('text' in token) {
            result += (token as any).text + ' ';
          }
      }
    }

    return result.trim();
  }

  /**
   * Process a table cell by extracting its text content
   */
  private processTableCell(cell: Tokens.TableCell): string {
    // If the cell has tokens, process them
    if (cell.tokens) {
      return this.processTokens(cell.tokens);
    }
    return '';
  }

  /**
   * Check if this processor can handle the given file
   * @param filePath Path to the file
   * @returns True if this is a markdown file
   */
  canProcess(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ext === '.md' || ext === '.markdown' || ext === '.mdx';
  }

  /**
   * Extract the title from markdown content
   * Looks for H1 and H2 headers in order of preference
   *
   * @param content The markdown content
   * @param resourceId Optional resource ID to use as fallback
   * @returns The extracted title
   */
  public extractTitle(content: string, resourceId: string = ''): string {
    // Try to find an H1 heading (# Title)
    const h1Match = content.match(/^#\s+(.+?)(?:\r?\n|$)/m);
    if (h1Match) return h1Match[1].trim();

    // Try to find an H2 heading (## Title)
    const h2Match = content.match(/^##\s+(.+?)(?:\r?\n|$)/m);
    if (h2Match) return h2Match[1].trim();

    // Default to a humanized version of the resource ID if no title found
    if (resourceId) {
      const basename = resourceId.split('/').pop() || '';
      return basename.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    }

    return '';
  }

  /**
   * Extract parameter data from markdown tables
   * Specifically looks for tables with a "Parameter" column
   *
   * @param content The markdown content
   * @returns String containing parameter names and descriptions
   */
  public extractParameterData(content: string): string {
    // Match markdown tables that have a header row containing "Parameter"
    const tableRegex = /\|[^|]*Parameter[^|]*\|[^|]*\|[\s\S]*?(?=\n\n|\n#|\n$)/g;
    const tables = content.match(tableRegex);

    if (!tables) return '';

    // Process each table to extract parameter names and descriptions
    return tables.map((table: string) => {
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

  /**
   * Extract API endpoint pattern from markdown content
   * Looks for common REST API patterns like GET /path
   *
   * @param content The markdown content
   * @returns Extracted endpoint pattern or null if none found
   */
  public extractEndpointPattern(content: string): string | null {
    // Match common REST API endpoint patterns (HTTP method + path)
    const endpointMatch = content.match(/\b(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+(\/[a-zA-Z0-9\/_:.-]+)\b/);
    return endpointMatch ? `${endpointMatch[1]} ${endpointMatch[2]}` : null;
  }

  /**
   * Extract a relevant snippet of content around a search query
   *
   * @param content The markdown content
   * @param query The search query
   * @returns A snippet of content around the query
   */
  public extractContentSnippet(content: string, query: string): string {
    // First clean the query for regex safety
    const safeQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Try to find the query in the content
    const regex = new RegExp(`(.{0,100})(${safeQuery})(.{0,100})`, 'i');
    const match = content.match(regex);

    if (match) {
      // Return the context around the match
      return `...${match[1]}${match[2]}${match[3]}...`;
    }

    // If no match, return the beginning of the content
    return content.substring(0, 200) + '...';
  }
}
