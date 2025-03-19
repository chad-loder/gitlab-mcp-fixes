/**
 * Processor Configuration System
 *
 * Defines types and utilities for configuring processor instances
 * in a declarative, configuration-driven way.
 */

import { IndexingProcessorOptions } from './base.js';

/**
 * Processor types supported by the system
 */
export type ProcessorType = 'plaintext' | 'markdown' | 'gitlabMarkdown';

/**
 * Map of processor types to their type string representations
 * Used for validation and type checking
 */
export const PROCESSOR_TYPE_MAP: Record<ProcessorType, string> = {
  plaintext: 'plaintext',
  markdown: 'markdown',
  gitlabMarkdown: 'gitlabMarkdown'
};

/**
 * Base configuration for any processor
 */
export interface BaseProcessorConfig extends IndexingProcessorOptions {
  type: ProcessorType;
  debug?: boolean;
}

/**
 * Configuration for plaintext processor
 */
export interface PlaintextProcessorConfig extends BaseProcessorConfig {
  type: 'plaintext';
}

/**
 * Markdown processor specific options
 */
export interface MarkdownOptions {
  flavor?: 'gfm' | 'glfm' | string;
  breaks?: boolean;
  pedantic?: boolean;
  allowHtml?: boolean;
  markedOptions?: Record<string, any>;
}

/**
 * Configuration for markdown processor
 */
export interface MarkdownProcessorConfig extends BaseProcessorConfig {
  type: 'markdown';
  skipCodeBlocks?: boolean;
  skipHtml?: boolean;
  extractMetadata?: boolean;
  flavor?: string;
  options?: MarkdownOptions;
}

/**
 * Configuration for GitLab markdown processor
 */
export interface GitLabMarkdownProcessorConfig extends Omit<MarkdownProcessorConfig, 'type'> {
  type: 'gitlabMarkdown';
  extractMetadata?: boolean;
}

/**
 * Pattern mapping configuration, associating glob patterns with processor types
 */
export interface ProcessorPatternConfig {
  [pattern: string]: ProcessorType;
}

/**
 * Registry configuration
 */
export interface ProcessorRegistryConfig {
  defaultProcessor?: ProcessorType;
  patterns?: ProcessorPatternConfig;
}

/**
 * Complete processor configuration set
 */
export interface ProcessorConfigSet {
  base?: IndexingProcessorOptions;
  registry?: ProcessorRegistryConfig;
  plaintext?: PlaintextProcessorConfig;
  markdown?: MarkdownProcessorConfig;
  gitlabMarkdown?: GitLabMarkdownProcessorConfig;
}

/**
 * Default processor configuration set
 */
export const DEFAULT_PROCESSOR_CONFIG: ProcessorConfigSet = {
  base: {
    debug: false
  },
  registry: {
    defaultProcessor: 'plaintext',
    patterns: {
      '**/*.md': 'markdown',
      '**/*.markdown': 'markdown',
      '**/*.mdx': 'markdown',
      '**/*.txt': 'plaintext',
      '**/*.text': 'plaintext'
    }
  },
  plaintext: {
    type: 'plaintext'
  },
  markdown: {
    type: 'markdown',
    skipCodeBlocks: true,
    skipHtml: true,
    extractMetadata: true,
    flavor: 'gfm',
    options: {
      breaks: false,
      pedantic: false,
      allowHtml: true
    }
  },
  gitlabMarkdown: {
    type: 'gitlabMarkdown',
    skipCodeBlocks: true,
    skipHtml: true,
    extractMetadata: true,
    flavor: 'glfm',
    options: {
      breaks: false,
      pedantic: false,
      allowHtml: true
    }
  }
};

/**
 * Merge a custom configuration with the default/base configuration
 * @param customConfig Custom configuration to apply
 * @param baseConfig Base configuration to extend (defaults to DEFAULT_PROCESSOR_CONFIG)
 * @returns Merged configuration set
 */
export function mergeConfig(
  customConfig: Partial<ProcessorConfigSet> = {},
  baseConfig: ProcessorConfigSet = DEFAULT_PROCESSOR_CONFIG
): ProcessorConfigSet {
  // Start with a deep copy of the base config
  const result: ProcessorConfigSet = JSON.parse(JSON.stringify(baseConfig));

  // Merge base options if provided
  if (customConfig.base) {
    result.base = { ...result.base, ...customConfig.base };
  }

  // Merge registry config if provided
  if (customConfig.registry) {
    if (!result.registry) {
      result.registry = {};
    }

    // Merge defaultProcessor
    if (customConfig.registry.defaultProcessor) {
      result.registry.defaultProcessor = customConfig.registry.defaultProcessor;
    }

    // Merge pattern mappings
    if (customConfig.registry.patterns) {
      result.registry.patterns = {
        ...result.registry.patterns,
        ...customConfig.registry.patterns
      };
    }
  }

  // Merge processor-specific configs
  Object.keys(customConfig).forEach(key => {
    if (key === 'base' || key === 'registry') {
      // Already handled
      return;
    }

    // Handle specific processor configs
    if (key === 'plaintext' || key === 'markdown' || key === 'gitlabMarkdown') {
      const processorKey = key as keyof ProcessorConfigSet;
      if (customConfig[processorKey]) {
        result[processorKey] = {
          ...result[processorKey],
          ...customConfig[processorKey]
        } as any; // Use type assertion to avoid complex type constraint
      }
    }
  });

  return result;
}

/**
 * Get processor options for a specific processor type
 * @param config The complete configuration set
 * @param processorType The type of processor to get options for
 * @returns Options for the specified processor
 */
export function getProcessorOptions(
  config: ProcessorConfigSet,
  processorType: ProcessorType
): IndexingProcessorOptions {
  // Start with a copy of base options or empty object if not defined
  const baseOptions: IndexingProcessorOptions = config.base ? {...config.base} : {};

  // Add processor-specific options
  switch (processorType) {
    case 'plaintext':
      return config.plaintext
        ? { ...baseOptions, ...config.plaintext }
        : baseOptions;
    case 'markdown':
      return config.markdown
        ? { ...baseOptions, ...config.markdown }
        : baseOptions;
    case 'gitlabMarkdown':
      return config.gitlabMarkdown
        ? { ...baseOptions, ...config.gitlabMarkdown }
        : baseOptions;
    default:
      return baseOptions;
  }
}
