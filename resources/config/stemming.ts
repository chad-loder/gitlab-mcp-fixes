/**
 * Stemming Utility
 * Implements stemming functions based on collection configuration
 */

import { CollectionConfig } from './loader.js';

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

  const stemmingConfig = config.search.termProcessing.stemming;

  // Handle plurals
  if (stemmingConfig.handlePlurals) {
    if (term.endsWith('ies') && term.length > 4) {
      term = term.substring(0, term.length - 3) + 'y';
    } else if (term.endsWith('es') && term.length > 3) {
      term = term.substring(0, term.length - 2);
    } else if (term.endsWith('s') && !term.endsWith('ss') && term.length > 3) {
      term = term.substring(0, term.length - 1);
    }
  }

  // Handle verb forms
  if (stemmingConfig.handleVerbForms) {
    if (term.endsWith('ed') && term.length > 4) {
      if (term.endsWith('ied') && term.length > 4) {
        term = term.substring(0, term.length - 3) + 'y';
      } else if (term.endsWith('ed') && term.length > 3) {
        term = term.substring(0, term.length - 2);
      }
    } else if (term.endsWith('ing') && term.length > 5) {
      // remove ing and possibly add back an 'e'
      const stemmed = term.substring(0, term.length - 3);
      // If removing 'ing' results in a word ending with a consonant followed by a single vowel followed
      // by a single consonant, we double the final consonant and then remove the 'ing'
      const doubledConsonantPattern = /[bcdfghjklmnpqrstvwxz][aeiou][bcdfghjklmnpqrstvwxz]$/;
      if (doubledConsonantPattern.test(stemmed) && term.length > 6) {
        term = stemmed.substring(0, stemmed.length - 1);
      } else {
        term = stemmed;
      }
    }
  }

  // Handle common suffixes
  if (stemmingConfig.handleCommonSuffixes) {
    if (term.endsWith('ly') && term.length > 4) {
      term = term.substring(0, term.length - 2);
    } else if (term.endsWith('ment') && term.length > 6) {
      term = term.substring(0, term.length - 4);
    } else if (term.endsWith('ness') && term.length > 5) {
      term = term.substring(0, term.length - 4);
    } else if (term.endsWith('ity') && term.length > 5) {
      term = term.substring(0, term.length - 3) + 'e';
    } else if (term.endsWith('tion') && term.length > 5) {
      term = term.substring(0, term.length - 3) + 'e';
    }
  }

  return term;
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
