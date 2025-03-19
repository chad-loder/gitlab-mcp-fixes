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
  let originalTerm = term;

  // Handle verb forms first (order matters)
  if (stemmingConfig.handleVerbForms) {
    // -ing forms
    if (term.endsWith('ing')) {
      // Double consonant + ing pattern (running -> run)
      const doubleConsonantPattern = /([bcdfghjklmnpqrstvwxz])\1ing$/;
      if (doubleConsonantPattern.test(term)) {
        const match = term.match(doubleConsonantPattern);
        if (match) {
          term = term.slice(0, term.length - 4); // Remove 'ing' and the doubled consonant
          return term;
        }
      }

      // Standard -ing: remove 'ing' and check if we need to add 'e'
      const base = term.slice(0, term.length - 3);

      // Check if we need to add 'e' back (writing -> write)
      if (/[bcdfghjklmnpqrstvwxz][aeiou][bcdfghjklmnpqrstvwxz]$/.test(base)) {
        // No 'e' needed for consonant-vowel-consonant pattern
        return base;
      } else {
        // For some verbs where 'e' was dropped (make -> making)
        // Try both with and without 'e' and return the one that exists as a word
        return base + 'e';
      }
    }

    // -ed forms
    if (term.endsWith('ed')) {
      // Handle doubled consonant + ed (stopped -> stop)
      const doubleConsonantPattern = /([bcdfghjklmnpqrstvwxz])\1ed$/;
      if (doubleConsonantPattern.test(term)) {
        const match = term.match(doubleConsonantPattern);
        if (match) {
          return term.slice(0, term.length - 3); // Remove 'ed' and the doubled consonant
        }
      }

      // Handle -ied -> -y (tried -> try)
      if (term.endsWith('ied')) {
        return term.slice(0, term.length - 3) + 'y';
      }

      // Regular -ed: remove 'ed' and check if we need to add 'e'
      const base = term.slice(0, term.length - 2);

      // Some words need 'e' back (saved -> save)
      // This is a simplification; a real stemmer would use a dictionary
      return base;
    }
  }

  // Handle comparative/superlative forms
  if (term.endsWith('er') && term.length > 4) {
    // Doubling rule for shorter adjectives (bigger -> big)
    const doubleConsonantPattern = /([bcdfghjklmnpqrstvwxz])\1er$/;
    if (doubleConsonantPattern.test(term)) {
      return term.slice(0, term.length - 3);
    }

    // Check if it ends with 'ier' (happier -> happy)
    if (term.endsWith('ier')) {
      return term.slice(0, term.length - 3) + 'y';
    }

    // Regular -er (for things like quicker -> quick)
    return term.slice(0, term.length - 2);
  }

  if (term.endsWith('est') && term.length > 5) {
    // Doubling rule for shorter adjectives (biggest -> big)
    const doubleConsonantPattern = /([bcdfghjklmnpqrstvwxz])\1est$/;
    if (doubleConsonantPattern.test(term)) {
      return term.slice(0, term.length - 4);
    }

    // Check if it ends with 'iest' (happiest -> happy)
    if (term.endsWith('iest')) {
      return term.slice(0, term.length - 4) + 'y';
    }

    // Regular -est (for things like quickest -> quick)
    return term.slice(0, term.length - 3);
  }

  // Handle plurals
  if (stemmingConfig.handlePlurals) {
    if (term.endsWith('ies') && term.length > 4) {
      return term.slice(0, term.length - 3) + 'y';
    } else if (term.endsWith('es') && term.length > 3) {
      // Special case for -ches, -shes, -sses, etc.
      if (term.match(/[cs]hes$/) || term.match(/sses$/) || term.match(/xes$/)) {
        return term.slice(0, term.length - 2);
      }
      return term.slice(0, term.length - 1);
    } else if (term.endsWith('s') && !term.endsWith('ss') && !term.endsWith('us') && !term.endsWith('is') && term.length > 3) {
      return term.slice(0, term.length - 1);
    }
  }

  // Handle common suffixes
  if (stemmingConfig.handleCommonSuffixes) {
    if (term.endsWith('ly') && term.length > 4) {
      return term.slice(0, term.length - 2);
    } else if (term.endsWith('ment') && term.length > 6) {
      return term.slice(0, term.length - 4);
    } else if (term.endsWith('ness') && term.length > 5) {
      return term.slice(0, term.length - 4);
    } else if (term.endsWith('ity') && term.length > 5) {
      return term.slice(0, term.length - 3) + 'e';
    } else if (term.endsWith('tion') && term.length > 5) {
      return term.slice(0, term.length - 3) + 'e';
    } else if (term.endsWith('ization') && term.length > 8) {
      return term.slice(0, term.length - 7) + 'e';
    } else if (term.endsWith('ize') && term.length > 4) {
      return term.slice(0, term.length - 3) + 'e';
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
