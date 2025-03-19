/**
 * Configuration Viewer Tool
 * Command-line utility for viewing and validating collection configurations
 */

import { loadCollectionConfig, getAvailableCollections, loadAllCollectionConfigs, getAllConfigsAsJSON } from '../config/loader.js';
import { groupTermsByStems } from '../config/stemming.js';

// Process command line arguments
const args = process.argv.slice(2);
const command = args[0] || 'help';
const collectionId = args[1];

/**
 * Print help information
 */
function printHelp(): void {
  console.log('Configuration Viewer Tool');
  console.log('-------------------------');
  console.log('Commands:');
  console.log('  list                   List all available collections');
  console.log('  view <collection-id>   View configuration for a specific collection');
  console.log('  json <collection-id>   View JSON representation of a collection config');
  console.log('  stopwords <coll-id>    View stopwords for a specific collection');
  console.log('  stems <coll-id>        Show stemming examples for a collection');
  console.log('  help                   Show this help information');
}

/**
 * List all available collections
 */
async function listCollections(): Promise<void> {
  const collections = getAvailableCollections();

  console.log('Available Collections:');
  console.log('---------------------');

  if (collections.length === 0) {
    console.log('No collections found.');
    return;
  }

  for (const id of collections) {
    try {
      const config = await loadCollectionConfig(id);
      console.log(`- ${config.metadata.name} (${id})`);
      console.log(`  ${config.metadata.description}`);
    } catch (error: any) {
      console.log(`- ${id} (Error: ${error.message})`);
    }
  }
}

/**
 * View configuration for a specific collection
 *
 * @param {string} id - Collection ID
 */
async function viewConfig(id: string): Promise<void> {
  if (!id) {
    console.error('Error: No collection ID specified.');
    console.log('Use "list" to see available collections.');
    return;
  }

  try {
    const config = await loadCollectionConfig(id);

    console.log(`Configuration for: ${config.metadata.name} (${id})`);
    console.log('='.repeat(50));
    console.log(`Description: ${config.metadata.description}`);

    console.log('\nContent Settings:');
    console.log('-----------------');
    console.log(`Includes: ${config.content.includes.join(', ')}`);
    console.log(`Excludes: ${config.content.excludes.join(', ')}`);

    console.log('\nSearch Settings:');
    console.log('----------------');
    console.log('Boost:');
    Object.entries(config.search.boost).forEach(([field, value]) => {
      console.log(`  - ${field}: ${value}x`);
    });

    console.log('\nSearch Options:');
    Object.entries(config.search.options).forEach(([option, value]) => {
      console.log(`  - ${option}: ${value}`);
    });

    console.log('\nStemming Settings:');
    Object.entries(config.search.termProcessing.stemming).forEach(([option, value]) => {
      console.log(`  - ${option}: ${value}`);
    });

    console.log('\nCustom Functions:');
    console.log('----------------');
    if (config.functions) {
      Object.keys(config.functions).forEach(fn => {
        console.log(`  - ${fn}: function`);
      });
    } else {
      console.log('  No custom functions defined');
    }
  } catch (error: any) {
    console.error(`Error loading configuration: ${error.message}`);
  }
}

/**
 * View JSON representation of a collection config
 *
 * @param {string} id - Collection ID
 */
async function viewJson(id: string): Promise<void> {
  if (!id) {
    console.error('Error: No collection ID specified.');
    console.log('Use "list" to see available collections.');
    return;
  }

  try {
    const config = await loadCollectionConfig(id);
    console.log(JSON.stringify(config.toJSON(), null, 2));
  } catch (error: any) {
    console.error(`Error loading configuration: ${error.message}`);
  }
}

/**
 * View stopwords for a specific collection
 *
 * @param {string} id - Collection ID
 */
async function viewStopwords(id: string): Promise<void> {
  if (!id) {
    console.error('Error: No collection ID specified.');
    console.log('Use "list" to see available collections.');
    return;
  }

  try {
    const config = await loadCollectionConfig(id);
    const stopwords = config.getAllStopwords();

    console.log(`Stopwords for: ${config.metadata.name} (${id})`);
    console.log('='.repeat(50));
    console.log(`Total stopwords: ${stopwords.size}`);

    // Print categories if available
    const { common, domain, highFrequency, product } = config.search.termProcessing.stopwords;

    if (common) {
      console.log('\nCommon Stopwords:');
      console.log('-----------------');
      console.log(common.join(', '));
    }

    if (domain) {
      console.log('\nDomain-specific Stopwords:');
      console.log('-------------------------');
      console.log(domain.join(', '));
    }

    if (highFrequency) {
      console.log('\nHigh-frequency Stopwords:');
      console.log('------------------------');
      console.log(highFrequency.join(', '));
    }

    if (product) {
      console.log('\nProduct-specific Stopwords:');
      console.log('--------------------------');
      console.log(product.join(', '));
    }

    console.log('\nAll Stopwords:');
    console.log('-------------');
    console.log(Array.from(stopwords).sort().join(', '));
  } catch (error: any) {
    console.error(`Error loading configuration: ${error.message}`);
  }
}

/**
 * Show stemming examples for a collection
 *
 * @param {string} id - Collection ID
 */
async function showStemming(id: string): Promise<void> {
  if (!id) {
    console.error('Error: No collection ID specified.');
    console.log('Use "list" to see available collections.');
    return;
  }

  try {
    const config = await loadCollectionConfig(id);

    // Example terms to show stemming for
    const exampleTerms = [
      'project', 'projects', 'projectile', 'projection',
      'create', 'creating', 'created', 'creation',
      'user', 'users', 'using', 'used',
      'repository', 'repositories',
      'authorize', 'authorization', 'authorizing',
      'quickly', 'quicker', 'quickest',
      'commit', 'committing', 'committed',
      'dependency', 'dependencies'
    ];

    console.log(`Stemming Examples for: ${config.metadata.name} (${id})`);
    console.log('='.repeat(50));

    const stemGroups = groupTermsByStems(exampleTerms, config);

    console.log('\nStem Groups:');
    console.log('-----------');
    Array.from(stemGroups.entries()).forEach(([stem, terms]) => {
      console.log(`${stem}: ${terms.join(', ')}`);
    });

    // Import the stemming module dynamically
    import('../config/stemming.js').then(stemmingModule => {
      console.log('\nAll Terms:');
      console.log('---------');
      exampleTerms.forEach(term => {
        const stemmed = config.search.termProcessing.stemming.enabled
          ? stemmingModule.applyStemming(term, config)
          : '(stemming disabled)';
        console.log(`${term.padEnd(15)} -> ${stemmed}`);
      });
    });
  } catch (error: any) {
    console.error(`Error loading configuration: ${error.message}`);
  }
}

// Main command router
async function main(): Promise<void> {
  switch (command) {
    case 'list':
      await listCollections();
      break;
    case 'view':
      await viewConfig(collectionId);
      break;
    case 'json':
      await viewJson(collectionId);
      break;
    case 'stopwords':
      await viewStopwords(collectionId);
      break;
    case 'stems':
      await showStemming(collectionId);
      break;
    case 'help':
    default:
      printHelp();
      break;
  }
}

// Run the command
main().catch((error: any) => {
  console.error('Error:', error.message || error);
  process.exit(1);
});
