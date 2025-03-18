# MCP Resources

This directory contains documentation resources that can be accessed through the MCP server's resource API. The primary resource is the GitLab API documentation.

## GitLab API Documentation

The `gitlab-api-docs` directory contains a copy of GitLab's official API documentation, which is used to provide searchable documentation resources to AI clients through the MCP server.

### How the Documentation Was Obtained

The GitLab API documentation was obtained using Git's sparse checkout feature, which allows checking out only a specific part of a repository. In this case, we only needed the API documentation from GitLab's documentation repository.

Here's how the sparse checkout was performed:

```bash
# Create a new directory for the sparse checkout
mkdir -p resources/gitlab-api-docs

# Initialize a new git repository
cd resources/gitlab-api-docs
git init

# Add the GitLab docs repository as a remote
git remote add origin https://gitlab.com/gitlab-org/gitlab-docs.git

# Configure sparse checkout
git config core.sparseCheckout true

# Specify the API documentation path to checkout
echo "content/api/" > .git/info/sparse-checkout

# Fetch the content
git fetch --depth=1 origin master

# Checkout the content
git checkout master

# Move the API docs to the root level and clean up
mv content/api/* .
rm -rf content/

# Remove the .git directory to detach from the original repository
rm -rf .git/
```

This process extracts only the API documentation markdown files without the entire GitLab documentation repository, making it more manageable for our purposes.

### Resource ID Format

Resources in the system use a hierarchical ID format that uniquely identifies each document:

```
<collection_id>/<relative_path_without_extension>
```

For example:
- `gitlab-api-docs/users` - The main Users API documentation
- `gitlab-api-docs/group_labels` - Documentation for group labels
- `gitlab-api-docs/rest/authentication` - Authentication documentation in the REST subdirectory

This ID format serves two purposes:
1. It ensures uniqueness across all documents, even when files in different directories have the same name
2. It provides a predictable way to reference resources in MCP function calls

### Using Search Results

When using the `mcp_GitLab_MCP_search_resources` function, the results include both `id` and `resource_id` fields (they contain the same value) that can be used to retrieve the full content of a document with the `mcp_GitLab_MCP_read_resource` function.

Typical workflow:

1. Search for relevant documentation:
   ```javascript
   const searchResults = await mcp.invoke('mcp_GitLab_MCP_search_resources', {
     collection_id: 'gitlab-api-docs',
     query: 'create project',
     limit: 5
   });
   ```

2. Get the full content of a specific result:
   ```javascript
   const resource = await mcp.invoke('mcp_GitLab_MCP_read_resource', {
     collection_id: 'gitlab-api-docs',
     resource_id: searchResults[0].resource_id
   });
   ```

This pattern allows AI clients to efficiently find and access the most relevant documentation for user queries.

### Enhanced Search Implementation

The resources use MiniSearch, a lightweight full-text search engine, configured specifically for API documentation:

1. **Title Extraction**: We extract titles from the first H1 or H2 heading in the document, with fallbacks to humanized resource IDs.

2. **Parameter Table Processing**: We extract parameter tables from the documentation and give them higher weight in search results. This ensures that searches for specific parameters return the most relevant documentation.

3. **API Endpoint Detection**: We detect and extract REST API endpoint patterns (like `GET /api/v4/projects/:id/issues`) to make them easily searchable.

4. **Custom Stopwords**: We use a curated list of stopwords specific to API documentation, eliminating common terms like "gitlab", "api", "parameter", etc. that would otherwise dominate search results.

5. **Weighted Fields**: Searches prioritize matches in this order:
   - Titles (3x weight)
   - Parameter information (2x weight)
   - Content (1x weight)

6. **Search Optimizations**:
   - Prefix matching enables partial word matches
   - Fuzzy search (with 0.2 distance threshold) allows for minor typos
   - Snippet extraction provides context around matches

This implementation is optimized specifically for API documentation search, making it easier for AI clients to find relevant endpoints and parameter information.

### Syncing and Updating Documentation

To update the documentation with newer versions from GitLab, you can repeat a similar process:

```bash
# Create a temporary directory
mkdir -p /tmp/gitlab-docs-update
cd /tmp/gitlab-docs-update

# Initialize a new git repository
git init

# Add the GitLab docs repository as a remote
git remote add origin https://gitlab.com/gitlab-org/gitlab-docs.git

# Configure sparse checkout
git config core.sparseCheckout true

# Specify the API documentation path to checkout
echo "content/api/" > .git/info/sparse-checkout

# Fetch the latest content
git fetch --depth=1 origin master

# Checkout the content
git checkout master

# Copy the updated files to your project
cp -R content/api/* /path/to/your/project/main/resources/gitlab-api-docs/

# Clean up
cd ..
rm -rf gitlab-docs-update
```

### GitHub Secret Scanning Push Protection

**Important Note:** When pushing GitLab API documentation to GitHub, you may encounter issues with GitHub's secret scanning protection. The documentation contains example API tokens and credentials that are detected as potential secrets by GitHub's scanning system.

If you encounter a push rejection with a message like:

```
remote: error: GH013: Repository rule violations found for refs/heads/your-branch.
remote: - GITHUB PUSH PROTECTION
remote:   —————————————————————————————————————————
remote:     Resolve the following violations before pushing again
remote:     - Push cannot contain secrets
```

You have two options:

1. **Recommended: Configure Secret Scanning Exemptions**
   
   Create or modify `.github/secret_scanning.yml` in your repository with:
   
   ```yaml
   paths-ignore:
     - "resources/gitlab-api-docs/**"
   ```
   
   This tells GitHub to ignore potential secrets in the documentation files.

2. **Alternative: Allow Specific Secrets**
   
   If GitHub provides a URL to approve a specific detected secret, you can follow that URL to mark it as a false positive. This is less ideal for documentation files as they may contain many example tokens.

Remember that these example credentials in the documentation are not real secrets but are used for illustration purposes only.

## Resources API

The resources in this directory are made available through the following MCP API functions:

- `mcp_GitLab_MCP_list_collections`: Lists all available documentation collections
- `mcp_GitLab_MCP_list_resources`: Lists all resources within a collection
- `mcp_GitLab_MCP_read_resource`: Retrieves the content of a specific resource
- `mcp_GitLab_MCP_search_resources`: Searches for content within a collection's resources

These functions allow AI clients to efficiently access and search the GitLab API documentation. 

### Command-line Diagnostics

For development and debugging purposes, you can run diagnostics on the GitLab API documentation search functionality using:

```bash
node build/resources/gitlab-api-docs.js --diagnose
```

This will:
1. Load all GitLab API documentation
2. Display statistics about the content (size, parameter tables, etc.)
3. Build a search index
4. Run test searches with timing information
5. Show sample resource IDs and how to use them in MCP calls

This is useful for validating the search functionality and understanding how documents are organized and indexed. 
