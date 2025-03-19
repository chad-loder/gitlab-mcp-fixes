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
}
