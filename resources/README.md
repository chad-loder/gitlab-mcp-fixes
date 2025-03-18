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
