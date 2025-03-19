import { BaseIndexingProcessor, IndexingProcessorOptions } from './base.js';
import * as path from 'path';

/**
 * Plaintext Processor
 *
 * A simple processor that leaves content mostly unchanged.
 * This serves as the default processor and a baseline for comparison.
 */
export class PlaintextProcessor extends BaseIndexingProcessor {
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
   * The plaintext processor can handle any file
   * It serves as the default fallback
   */
  canProcess(filePath: string): boolean {
    // Default processor handles everything
    return true;
  }
}
