import { describe, it, expect } from 'vitest';
import {
  tokenizeText,
  processTerm,
  tokenizeAndProcess,
  Tokenizer,
  TokenizerFactory,
  TokenizerOptions
} from './tokenizer.js';
import { API_DOC_STOPWORDS } from '../index.js';

// Tests for the legacy API functions
describe('Legacy API Functions', () => {
  describe('tokenizeText', () => {
    it('should tokenize a simple sentence', () => {
      const text = 'This is a test sentence';
      const tokens = tokenizeText(text);
      expect(tokens).toEqual(['This', 'is', 'a', 'test', 'sentence']);
    });

    it('should preserve underscores in identifiers', () => {
      const text = 'Function get_user_info() returns user data';
      const tokens = tokenizeText(text);
      expect(tokens).toContain('get_user_info');
    });

    it('should ignore special characters and only capture alphanumeric tokens', () => {
      const text = 'Test with !@#$%^& special characters';
      const tokens = tokenizeText(text);
      expect(tokens).toEqual(['Test', 'with', 'special', 'characters']);
    });

    it('should handle code snippets correctly', () => {
      const code = 'function calculateTotal(items_array) { return items_array.reduce((sum, item) => sum + item.price, 0); }';
      const tokens = tokenizeText(code);
      expect(tokens).toContain('function');
      expect(tokens).toContain('calculateTotal');
      expect(tokens).toContain('items_array');
      expect(tokens).toContain('reduce');
      expect(tokens).toContain('sum');
      expect(tokens).toContain('item');
      expect(tokens).toContain('price');
      // Should not contain special characters like { } ( ) => etc.
    });
  });

  describe('processTerm', () => {
    it('should convert terms to lowercase', () => {
      expect(processTerm('TEST')).toBe('test');
    });

    it('should filter out common stopwords', () => {
      // These are already added to API_DOC_STOPWORDS
      expect(processTerm('new')).toBeNull();
      expect(processTerm('name')).toBeNull();
      expect(processTerm('have')).toBeNull();
      expect(processTerm('return')).toBeNull();
      expect(processTerm('other')).toBe('other'); // Not in stopwords
    });

    it('should filter out stopwords from custom set', () => {
      const stopwords = new Set(['the', 'and', 'with']);
      expect(processTerm('the', stopwords)).toBeNull();
      expect(processTerm('and', stopwords)).toBeNull();
      expect(processTerm('other', stopwords)).toBe('other');
    });

    it('should filter out short terms except special cases', () => {
      expect(processTerm('a')).toBeNull();
      expect(processTerm('in')).toBeNull();
      expect(processTerm('id')).toBe('id'); // Special case for 'id'
    });

    it('should filter out long numeric tokens', () => {
      expect(processTerm('123')).toBeNull();
      expect(processTerm('12345')).toBeNull();
      expect(processTerm('12a')).toBe('12a'); // Not purely numeric
    });

    it('should filter out ordinal numbers', () => {
      expect(processTerm('75th')).toBeNull();
      expect(processTerm('50th')).toBeNull();
      expect(processTerm('21st')).toBeNull();
      expect(processTerm('3rd')).toBeNull();
      expect(processTerm('42nd')).toBeNull();
    });

    it('should filter out time and size measurements', () => {
      expect(processTerm('00z')).toBeNull();
      expect(processTerm('30m')).toBeNull();
      expect(processTerm('16kb')).toBeNull();
      expect(processTerm('1h30m')).toBeNull();
      expect(processTerm('5g')).toBeNull();
      expect(processTerm('200t')).toBeNull();
    });

    it('should filter out long hex-like strings and hashes', () => {
      expect(processTerm('287774414568010855642518513f085491644061')).toBeNull();
      expect(processTerm('a1b2c3d4e5f67890abcdef')).toBeNull();
      expect(processTerm('3fa85f64')).toBe('3fa85f64'); // Short enough to keep
    });

    it('should filter out strings with many consecutive digits', () => {
      expect(processTerm('data123456789')).toBeNull();
      expect(processTerm('token123456')).toBeNull();
      expect(processTerm('version2023')).toBe('version2023'); // Not too many digits
    });

    it('should apply stemming to longer words', () => {
      expect(processTerm('running')).toBe('run');
      expect(processTerm('jumps')).toBe('jump');
      expect(processTerm('easily')).toBe('easili');
    });

    it('should not stem tokens with underscores', () => {
      expect(processTerm('user_profile')).toBe('user_profile');
      expect(processTerm('get_data_items')).toBe('get_data_items');
      expect(processTerm('fetch_users')).toBe('fetch_users');
    });
  });

  describe('tokenizeAndProcess', () => {
    it('should tokenize and process text in one step', () => {
      const text = 'Running and jumping are good exercises';
      const stopwords = new Set(['and', 'are']);
      const processedTokens = tokenizeAndProcess(text, stopwords);

      expect(processedTokens).toEqual(['run', 'jump', 'good', 'exercis']);
    });

    it('should handle code examples correctly', () => {
      const code = 'function getUserData(user_id) { return fetchUserFromAPI(user_id); }';
      const processed = tokenizeAndProcess(code);

      // Should include key identifiers, stemmed if necessary
      expect(processed).toContain('function');
      expect(processed).toContain('getuserdata'); // Correct expectation for getUserData
      expect(processed).toContain('user_id');  // Should not be stemmed due to underscore
      expect(processed).not.toContain('return'); // Should be filtered as stopword
      expect(processed).toContain('fetchuserfromapi'); // Correct expectation for fetchUserFromAPI

      // Should not include special characters, short terms (except 'id')
    });

    it('should filter out common stopwords and ordinal numbers', () => {
      const text = 'Your new project is the 3rd in the 75th portfolio set';
      const processed = tokenizeAndProcess(text);

      expect(processed).not.toContain('your'); // filtered stopword
      expect(processed).not.toContain('new');  // filtered stopword
      expect(processed).toContain('project');
      expect(processed).not.toContain('3rd');  // filtered ordinal
      expect(processed).not.toContain('75th'); // filtered ordinal
      expect(processed).toContain('portfolio');
      expect(processed).toContain('set');
    });
  });
});

// Tests for the Tokenizer class
describe('Tokenizer', () => {
  describe('default tokenizer', () => {
    it('should use default settings when created with no options', () => {
      const tokenizer = new Tokenizer();

      // Test basic tokenization
      expect(tokenizer.tokenize('This is a test')).toEqual(['This', 'is', 'a', 'test']);

      // Test term processing with default settings
      expect(tokenizer.processTerm('TEST')).toBe('test');
      expect(tokenizer.processTerm('running')).toBe('run');
      expect(tokenizer.processTerm('75th')).toBeNull();
      expect(tokenizer.processTerm('user_profile')).toBe('user_profile');
    });
  });

  describe('custom tokenizer', () => {
    it('should respect provided options', () => {
      const options: Partial<TokenizerOptions> = {
        applyStemming: false,
        filterOrdinals: false,
        filterMeasurements: false
      };

      const tokenizer = new Tokenizer(options);

      // No stemming
      expect(tokenizer.processTerm('running')).toBe('running');

      // Don't filter ordinals
      expect(tokenizer.processTerm('75th')).toBe('75th');

      // Don't filter measurements
      expect(tokenizer.processTerm('30m')).toBe('30m');
    });

    it('should combine stopwords correctly', () => {
      const customStopwords = new Set(['custom', 'stopword']);
      const tokenizer = new Tokenizer({ stopwords: customStopwords });

      // Check that both the default and custom stopwords are filtered
      expect(tokenizer.processTerm('return')).toBeNull(); // default stopword
      expect(tokenizer.processTerm('custom')).toBeNull(); // custom stopword
      expect(tokenizer.processTerm('normal')).toBe('normal'); // not a stopword
    });
  });
});

// Tests for the TokenizerFactory
describe('TokenizerFactory', () => {
  it('should create a default tokenizer with getDefault', () => {
    const tokenizer = TokenizerFactory.getDefault();

    // Should behave like the default tokenizer
    expect(tokenizer.tokenize('This is a test')).toEqual(['This', 'is', 'a', 'test']);
    expect(tokenizer.processTerm('running')).toBe('run');
  });

  it('should configure tokenizer from collection config', () => {
    // Create a mock collection config
    const mockConfig = {
      search: {
        termProcessing: {
          stemming: {
            enabled: false
          }
        }
      },
      getAllStopwords: () => new Set(['config', 'stopword'])
    };

    const tokenizer = TokenizerFactory.createFromConfig(mockConfig as any);

    // Should use collection config settings
    expect(tokenizer.processTerm('running')).toBe('running'); // no stemming
    expect(tokenizer.processTerm('config')).toBeNull(); // custom stopword
  });
});
