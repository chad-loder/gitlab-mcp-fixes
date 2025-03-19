/**
 * Stemming Utility
 * Implements stemming functions based on collection configuration
 */

import { CollectionConfig } from './loader.js';
import * as porterStemmer from 'porterstem';

/**
 * Apply stemming to a term according to configuration settings
 *
 * @param {string} term - The term to stem
 * @param {CollectionConfig} config - The collection configuration
 * @returns {string} The stemmed term, or the original term if stemming is disabled
 */
export function applyStemming(term: string, config: CollectionConfig): string {
  // Return the original term if term is too short or stemming is disabled
  if (!term || term.length <= 3 || !config.search.termProcessing.stemming.enabled) {
    return term;
  }

  // Convert term to lowercase for consistent stemming
  term = term.toLowerCase();

  // Apply Porter stemming algorithm
  return porterStemmer.stem(term);
}

/**
 * Factory function to create a stemming function bound to a specific configuration
 *
 * @param {CollectionConfig} config - The collection configuration
 * @returns {function} A function that applies stemming according to the configuration
 */
export function createStemmingFunction(config: CollectionConfig): (term: string) => string {
  return (term: string) => applyStemming(term, config);
}

/**
 * Check if two terms match after stemming
 *
 * @param {string} term1 - First term to compare
 * @param {string} term2 - Second term to compare
 * @param {CollectionConfig} config - The collection configuration
 * @returns {boolean} True if the stemmed terms match, false otherwise
 */
export function stemmedTermsMatch(
  term1: string,
  term2: string,
  config: CollectionConfig
): boolean {
  return applyStemming(term1, config) === applyStemming(term2, config);
}

/**
 * Group a list of terms by their stems
 *
 * @param {string[]} terms - List of terms to group
 * @param {CollectionConfig} config - The collection configuration
 * @returns {Map<string, string[]>} Map of stems to arrays of terms that stem to that value
 */
export function groupTermsByStems(
  terms: string[],
  config: CollectionConfig
): Map<string, string[]> {
  const stemGroups = new Map<string, string[]>();

  terms.forEach(term => {
    const stemmed = applyStemming(term, config);

    if (stemmed !== term) {
      if (!stemGroups.has(stemmed)) {
        stemGroups.set(stemmed, [stemmed]);
      }

      const group = stemGroups.get(stemmed)!;
      if (!group.includes(term)) {
        group.push(term);
      }
    }
  });

  return stemGroups;
}
