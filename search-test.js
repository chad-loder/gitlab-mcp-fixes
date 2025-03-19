#!/usr/bin/env node

/**
 * Simple search test script for GitLab API documentation
 *
 * This script loads the GitLab API documentation collection
 * and performs searches with the provided query.
 */

import { getSearchIndexForCollection } from './build/resources/index.js';
import { registerGitLabApiDocs } from './build/resources/gitlab-api-docs.js';

// Search query from command line argument
const searchQuery = process.argv[2];

if (!searchQuery) {
  console.error('Please provide a search query as argument');
  console.error('Usage: node search-test.js "your search query"');
  process.exit(1);
}

// Main function
async function main() {
  console.log(`Searching for: "${searchQuery}"`);
  console.log('Loading GitLab API documentation...');

  // Register the GitLab API docs collection
  registerGitLabApiDocs();

  try {
    // Get collection ID from the module (hardcoded for this test)
    const collectionId = 'gitlab-api-docs';

    // Get the search index for the collection
    const collectionConfig = {
      id: collectionId,
      name: 'GitLab API Documentation',
      description: 'Official documentation for GitLab REST API endpoints',
      dirPath: './resources/gitlab-api-docs'
    };

    const { searchIndex, resources } = await getSearchIndexForCollection(collectionConfig);

    console.log(`Loaded ${resources.length} resources.`);

    // Perform search with the query
    console.log('Searching...');
    const startTime = performance.now();
    const results = searchIndex.search(searchQuery);
    const endTime = performance.now();
    const searchTime = (endTime - startTime).toFixed(2);

    console.log(`\nFound ${results.length} results in ${searchTime}ms:`);
    console.log('----------------------------------------------------');

    // Show the top 10 results
    const topResults = results.slice(0, 10);

    topResults.forEach((result, index) => {
      const resource = resources.find(r => r.id === result.id);
      console.log(`${index + 1}. ${resource.title || resource.id} (score: ${result.score.toFixed(2)})`);
      console.log(`   Resource ID: ${resource.id}`);
      console.log(`   URL: ${resource.url || 'N/A'}`);

      // Show matching terms
      if (result.terms && result.terms.length > 0) {
        console.log(`   Matching terms: ${result.terms.join(', ')}`);
      }

      // Get excerpt from content
      const excerpt = getExcerpt(resource.content, searchQuery.split(' ')[0], 100);
      if (excerpt) {
        console.log(`   Excerpt: ${excerpt}`);
      }

      console.log('');
    });
  } catch (error) {
    console.error('Error performing search:', error);
    process.exit(1);
  }
}

/**
 * Get a content excerpt around the first occurrence of a search term
 */
function getExcerpt(content, term, length = 100) {
  if (!content) return '';

  const lowerContent = content.toLowerCase();
  const lowerTerm = term.toLowerCase();

  const index = lowerContent.indexOf(lowerTerm);
  if (index === -1) return '';

  const start = Math.max(0, index - length / 2);
  const end = Math.min(content.length, index + term.length + length / 2);

  let excerpt = content.substring(start, end);

  // Add ellipsis if needed
  if (start > 0) excerpt = '...' + excerpt;
  if (end < content.length) excerpt = excerpt + '...';

  return excerpt;
}

// Run the main function
main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
