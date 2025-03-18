# Token-Efficient GitLab Operations Meta-Strategy

> **Last Updated: March 18, 2024**

> **IMPORTANT**: When mixing shell commands with built-in/MCP tools, take care with filenames to avoid confusion between Homebrew's view of the filesystem and macOS's view of the filesystem. Always use absolute paths when there's potential for ambiguity.

## Critical Patterns - ALWAYS FOLLOW

| PATTERN | EXAMPLE | REASON |
|---------|---------|--------|
| ALL `glab` list/view commands MUST use `--output json` | `glab mr list --output json` | Prevents pager issues, ensures consistent output |
| NEVER assume field names, check help first | `glab mr list --help | cat` to verify fields | Field names vary between commands |
| NEVER use numeric IDs without context | Use IID field from list output | IDs may not be consistent across views |
| WHEN using `glab ci run` | Use `--ref` for specific branch | Different from GitHub's workflow run |
| WHEN checking command options | ALWAYS pipe to cat: `command --help | cat` | Prevents pager interference |
| WHEN using `glab mr view` | Get MR IID from previous list command | Don't hardcode or assume numbers |
| WHEN not in a Git repo | Add `GITLAB_HOST=hostname` prefix | Specifies which GitLab instance to use |

## Common Mistakes to Avoid

| INCORRECT | CORRECT | WHY |
|-----------|---------|-----|
| `glab mr list --json id,status` | `glab mr list --output json` | Use `--output json` for full JSON output (no field selection) |
| `glab mr view 123` | `glab mr view $iid --output json` | Don't hardcode numbers, use variables |
| `glab ci run workflow.yml --json` | `glab ci run workflow.yml --ref main` | `--json` flag doesn't exist, use `--ref` instead |
| `glab mr list | cat` | `glab mr list --output json --per-page N` | Piping to cat doesn't fix structure |
| `glab mr view $id` | `glab mr view "$iid" --output json` | Always specify required JSON output format |
| `gh` commands | `glab` commands | Different CLI tools for GitHub vs GitLab |
| `--repo` parameter | `-R` parameter | GitLab CLI uses different parameter name |

## Core Decision Rules

| WHEN | UNLESS | THEN | NOTES |
|------|--------|------|-------|
| Using ANY `glab` command | NEVER | Add `--output json` with list/view commands | Not all commands support this format |
| Working with pipelines/CI | NEVER | Use `glab ci` with `--output json` where supported | Example: `glab ci list --output json` |
| Working with files | Large multi-directory changes | Use MCP file functions | `mcp_GitLab_MCP_create_or_update_file` or `mcp_GitLab_MCP_push_files` |
| Managing repositories | Complex template needed | Use MCP repo functions | `mcp_GitLab_MCP_create_repository`, `mcp_GitLab_MCP_fork_repository` |
| Working with issues | N/A | Use MCP issue functions | `mcp_GitLab_MCP_create_issue` |
| Creating MRs | Need advanced options | Use `glab mr create` command | MCP function has parameter validation issues |
| Managing existing MRs | N/A | Use `glab mr` commands with `--output json` | `glab mr [list|view|merge|approve]` |
| Searching GitLab | Complex filters needed | Use MCP search functions | `mcp_GitLab_MCP_search_repositories` |
| Batch operations across repos | N/A | Use `glab` CLI commands | Allows for scripting and iteration |
| Need to avoid interactive prompts | N/A | Use `--output json` flag with supported `glab` commands | Prevents pagers and interactive elements |
| Not in a Git repository | N/A | Prefix commands with `GITLAB_HOST` | Ensures correct instance is used |

## GitLab CLI Non-Interactive Usage Patterns

| WHEN | THEN | EXAMPLE |
|------|------|---------|
| Listing MRs | `glab mr list --output json` | `glab mr list --output json --per-page 30` |
| Viewing MR details | `glab mr view <number> --output json` | `glab mr view 123 --output json` |
| Merging MRs | `glab mr merge <number> --remove-source-branch` | `glab mr merge 123 --remove-source-branch` |
| Listing pipeline runs | `glab ci list --output json` | `glab ci list --output json --per-page 30` |
| Viewing pipeline details | `glab ci view <pipeline-id> --output json` | `glab ci view 12345 --output json` |
| Running a pipeline | `glab ci run <ref> [--variables]` | `glab ci run main --variables "key:value"` |
| API requests | `glab api <endpoint>` | `glab api projects/12345/issues` |
| Filtering JSON output | Pipe to jq | `glab mr list --output json | jq '.[] | select(.state=="opened")'` |

## Critical Guidelines for Non-Interactive GitLab CLI Usage

| WHEN | DO THIS | AVOID THIS |
|------|---------|------------|
| Running any glab command | Use `--output json` flag where supported | Commands without `--output json` (may trigger pagers) |
| Need formatted output | Pipe JSON output to jq for filtering | Parsing text output |
| Viewing logs or content | Add output redirection or `| cat` | Direct output (may trigger pagers) |
| Running commands that edit content | Use non-interactive flags | Commands that might open an editor |
| Authenticating | Use `GITLAB_TOKEN` environment variable | `glab auth login` (interactive) |
| Running in scripts/AI context | Redirect any stderr | Relying on TTY detection |
| Using commands with confirmation | Add explicit flags like `--remove-source-branch` | Default behavior (interactive) |
| Merging MRs | Use explicit flags like `--remove-source-branch` | Default behavior (interactive) |
| Working with long outputs | Specify `--per-page` parameter | Unlimited results (pagination prompts) |
| Running any git operation | Add `-c core.editor=true` or `GIT_EDITOR=true` | Default editor behavior |
| Working with multiple GitLab instances | Always set `GITLAB_HOST` explicitly | Relying on auto-detection |

## Safe Authentication Options

| WHEN | THEN | EXAMPLE |
|------|------|---------|
| Authenticating in scripts | Use environment variables | `export GITLAB_TOKEN=your_token` |
| Checking auth status | Check status with redirection | `glab auth status 2>&1 | grep -v "Token"` |
| Switching accounts | Use token-based auth, not interactive login | Replace token in environment, don't use `glab auth login` |
| Need different scopes | Set token with proper scopes in environment | Don't request scope changes interactively |
| Working across hosts | Use host-specific config or GITLAB_HOST env variable | `GITLAB_HOST=gitlab.example.com glab repo clone group/project` |
| Working with self-hosted GitLab | Use `GITLAB_HOST` | `GITLAB_HOST=gitlab.cybersn.com glab issue list -R group/project` |

## MCP Function Reference

| WHEN | USE THIS FUNCTION | PARAMETERS |
|------|-------------------|------------|
| Creating/updating a file | `mcp_GitLab_MCP_create_or_update_file` | project_id, file_path, content, commit_message, branch |
| Getting file contents | `mcp_GitLab_MCP_get_file_contents` | project_id, file_path, [ref] |
| Committing multiple files | `mcp_GitLab_MCP_push_files` | project_id, branch, files, commit_message |
| Creating a repository | `mcp_GitLab_MCP_create_repository` | name, [description], [visibility] |
| Forking a repository | `mcp_GitLab_MCP_fork_repository` | project_id, [namespace] |
| Creating a branch | `mcp_GitLab_MCP_create_branch` | project_id, branch, [ref] |
| Creating an issue | `mcp_GitLab_MCP_create_issue` | project_id, title, [description], [assignee_ids], [labels] |
| Creating a MR | `mcp_GitLab_MCP_create_merge_request` | project_id, title, source_branch, target_branch, [description] |
| Searching repositories | `mcp_GitLab_MCP_search_repositories` | search, [page], [per_page] |
| Getting MR details | `mcp_GitLab_MCP_get_merge_request` | project_id, merge_request_iid |
| Getting MR diffs | `mcp_GitLab_MCP_get_merge_request_diffs` | project_id, merge_request_iid |
| Adding comments | `mcp_GitLab_MCP_create_note` | project_id, noteable_type, noteable_iid, body |

## Token-Efficient Response Processing

| WHEN | THEN | NOTES |
|------|------|-------|
| Using MCP functions | Return structured data directly | Data is already in structured JSON format |
| Using `glab` with `--output json` | Parse JSON response | Full data structure provided |
| Filtering `glab` output | Pipe to jq for field selection | `--output json | jq '.[] | {key: .value}'` |
| Needing specific fields only | Process JSON output with jq | `--output json | jq 'select(.state == "opened")'` |
| Processing large result sets | Use pagination with explicit limits | `--per-page 10` |
| Error handling | Check exit codes and error messages | `glab` returns non-zero exit code on failure |
| JSON response merging | Use jq to combine results | `jq -s '.[0] * .[1]'` to merge two JSON objects |

## Command Cheat Sheet

### File Operations
```bash
# Create or update file
mcp_GitLab_MCP_create_or_update_file project_id="12345" file_path="path/to/file.txt" content="file content" commit_message="commit message" branch="main"

# Get file contents
mcp_GitLab_MCP_get_file_contents project_id="12345" file_path="path/to/file.txt"
```

### MR Operations
```bash
# List MRs with JSON output
glab mr list --output json --per-page 30

# View MR details
glab mr view 123 --output json

# Merge an MR non-interactively
glab mr merge 123 --remove-source-branch
```

### Pipeline & CI/CD
```bash
# List pipelines with JSON output
glab ci list --output json --per-page 30

# View specific pipeline details
glab ci view 12345 --output json

# Run pipeline non-interactively
glab ci run --ref main --variables "VAR1:value1" "VAR2:value2"
```

### Repository Operations
```bash
# Create repository
mcp_GitLab_MCP_create_repository name="new-repo" description="Description" visibility="private"

# Clone repository
glab repo clone group/project [directory]
```

### API Requests
```bash
# Execute API request
glab api projects/12345/issues

# Filter API results with jq
glab api projects/12345/repository/branches | jq '.[] | select(.name == "main")'
```

## High-Risk Operations Requiring Extra Caution

| OPERATION | RISK | REQUIRED CONFIRMATION | MITIGATION |
|-----------|------|----------------------|------------|
| Force pushing to protected branches | History rewriting | Explicit permission | Explain consequences of force push before executing |
| Token handling | Security exposure | Verify token scope | Never display full tokens, use environment variables only |
| Repository deletion | Permanent data loss | Multiple confirmations | Always ask for explicit confirmation before delete operations |
| `mcp_GitLab_MCP_push_files` with many files | Mass changes | Review file list | Summarize all files being modified before executing |
| Pipeline runs with variables | May trigger unwanted processes | Scope verification | Verify inputs and target branch before triggering |
| Enterprise-level changes | Wide impact | Admin confirmation | Explicitly confirm changes affecting multiple repositories |
| Creating webhooks | Security implications | Review endpoints | Verify webhook endpoints and request for confirmation |
| `glab api` with POST/PATCH/DELETE | Direct API mutations | Method confirmation | Always highlight non-GET methods for special attention |
| Switching authentication context | Wrong account actions | Context verification | Explicitly display the active user before critical operations |
| Managing CI/CD variables | Sensitive data exposure | Explicit confirmation | Never log or display secret values, use file input when possible |
| `glab variable delete` | Removes critical credentials | Explicit confirmation | Verify exact variable name before deletion |

## GitLab Variables (Secrets) Management

| WHEN | THEN | EXAMPLE | NOTES |
|------|------|---------|-------|
| Listing variables | Use `glab variable list` | `glab variable list -g group_id` | Group or project scoped |
| Setting a variable | Use `glab variable create` with value redirection | `glab variable create API_KEY < key.txt` | Never include secret values in command line |
| Setting from environment | Use shell variable redirection | `echo $VALUE | glab variable create SECRET_NAME` | Prevents secret from appearing in command history |
| Deleting a variable | Use `glab variable delete` | `glab variable delete DEPRECATED_KEY` | Get confirmation before deletion |
| Group variables | Add `-g` flag | `glab variable list -g my-group-id` | Requires group admin permissions |
| Environment variables | Add `-e` flag | `glab variable create API_KEY -e production < key.txt` | Only affects specified environment |
| Using variables in CI/CD | Reference with `$VARIABLE_NAME` | `$API_TOKEN` | Never log pipeline runs with secret outputs |
| Rotating variables | Update with same name | `glab variable create API_KEY < new_key.txt` | Consider updating dependent pipelines |

## Secure Temporary File Pattern for Secrets

| WHEN | THEN | EXAMPLE | SECURITY PROPERTIES |
|------|------|---------|---------------------|
| Need to set GitLab variables | Use temporary file pattern | See tested pattern below | No bash history exposure, no ps exposure |
| Need to authenticate API calls | Use temporary file for token | `export GITLAB_TOKEN=$(cat "$tokenFile")` | Token not visible in command args |
| Need to pass secrets to commands | Use file redirection | `glab variable create KEY < "$secretFile"` | Secret not visible in process list |
| Using secrets in scripts | Create temp files with proper permissions | `secretFile=$(mktemp -t tmp_token)` | Mode 600, system temp dir |
| Creating temp files | Use system temp dir | `mktemp -t prefix` | Not in working directory |
| Cleaning up after use | Remove immediately | `rm -f "$secretFile"` | Prevents leakage |

### Tested Secure Pattern

```bash
# Step 1: Create secure temporary file (mode 600 by default)
unset secretFile && secretFile=$(mktemp -t tmp_token) && echo "Created $secretFile"

# Step 2: Write secret to file (without echo'ing the secret)
# Use edit_file tool to write content to the file
# edit_file $secretFile

# Step 3: Use the file with GitLab CLI 
glab variable create SECRET_NAME < "$secretFile"

# Step 4: Clean up immediately
rm -f "$secretFile" && echo "Secret set and temp file removed"
```

### Exception: Random Secret Generation

For generating random secrets, use process substitution to avoid any temporary files:

```bash
# Generate random secret with standardized length (32-64 chars) and pipe directly to glab
glab variable create API_KEY < <(pwgen -s $(( (RANDOM % (64 - 32 + 1)) + 32 )) 1)

# No cleanup needed - nothing written to disk
```

This pattern:
1. Avoids any file creation (more secure than temp files)
2. Creates cryptographically strong random secrets between 32-64 characters (industry standard)
3. Never exposes the secret value in history, process list, or on disk
4. Eliminates the need for cleanup

> **NOTE**: Always use the 32-64 character range unless the context explicitly requires different lengths. This range provides sufficient entropy for virtually all GitLab CI/CD variables and API tokens.

## MCP Known Issues

| ISSUE | WORKAROUND | DETAILS |
|-------|------------|---------|
| `create_merge_request` requires undocumented parameters | Use `glab mr create` instead | Accepts basic parameters but fails with validation errors for `diff_refs`, `force_remove_source_branch`, `changes_count` |
| `get_merge_request` fails with parameter validation | Use `glab api "projects/PROJECT_ID/merge_requests/MR_IID"` | Parameter validation in MCP is stricter than documented |
| GitLab artifact downloads fail with MCP | Use glab API with correct port | `GITLAB_HOST=hostname:port glab api "projects/PROJECT_ID/jobs/JOB_ID/artifacts" > artifacts.zip` |
| Port specification required for some environments | Add port to GITLAB_HOST | Use `GITLAB_HOST=gitlab.example.com:PORT` format |
| MCP server start script issues | Execute built code directly | Use `node $REPO_DIR/build/index.js` with environment variables explicitly passed |

### Fixed Issues (Working Now)
These issues have been fixed in recent versions of the MCP server:
- API endpoint construction (singular vs plural resource names)
- Double `/api/v4` path handling
- File function parameter requirements (`create_or_update_file` no longer requires `commit_id`)
- URL encoding for path parameters

### Working MCP Functions

| FUNCTION | USAGE | NOTES |
|----------|-------|-------|
| `mcp_GitLab_MCP_create_branch` | `project_id`, `branch`, `ref` | Creates branches successfully |
| `mcp_GitLab_MCP_create_issue` | `project_id`, `title`, `description` | Creates issues successfully |
| `mcp_GitLab_MCP_get_file_contents` | `project_id`, `file_path`, `ref` | Retrieves file contents successfully |
| `mcp_GitLab_MCP_push_files` | `project_id`, `branch`, `files`, `commit_message` | Creates new files successfully |
| `mcp_GitLab_MCP_search_repositories` | `search`, `page`, `per_page` | Searches repositories successfully |
| `mcp_GitLab_MCP_create_note` | `project_id`, `noteable_type`, `noteable_iid`, `body` | Creates notes on issues and merge requests |
| `mcp_GitLab_MCP_create_or_update_file` | `project_id`, `file_path`, `content`, `commit_message`, `branch` | Creates or updates files successfully |

### MCP Function Alternatives

| FUNCTION | ALTERNATIVE | EXAMPLE |
|----------|-------------|---------|
| `create_merge_request` | `glab mr create` | `GITLAB_HOST=gitlab.cybersn.com:8443 glab mr create --title "Title" --description "Description" --source-branch branch1 --target-branch branch2` |
| `create_note` (for environments with older versions) | `glab api` | `GITLAB_HOST=gitlab.cybersn.com:8443 glab api "projects/PROJECT_ID/issues/ISSUE_IID/notes" --method POST --field "body=Comment text"` |
| `get_merge_request` | `glab api` | `GITLAB_HOST=gitlab.cybersn.com:8443 glab api "projects/PROJECT_ID/merge_requests/MR_IID"` |

### Best Practices for SSH Proxied GitLab Instances

When connecting to GitLab instances via SSH port forwarding:

1. Always specify the port in GITLAB_HOST: `GITLAB_HOST=gitlab.example.com:8443`
2. For artifact downloads, use API instead of job commands: 
   ```
   GITLAB_HOST=gitlab.example.com:8443 glab api "projects/PROJECT_ID/jobs/JOB_ID/artifacts" > artifacts.zip
   ```
3. Verify pipeline completion before attempting to access artifacts
4. If MCP functions fail, fall back to CLI commands with proper port specification

### MCP Implementation Issues

Some implementation challenges remain in the MCP codebase:

1. Schema validation vs implementation mismatches (extra required parameters)
2. Strict validation of response data that may contain null values
3. Environment variable handling issues in start scripts

When the MCP functions fail, examine error messages carefully to determine whether to:
1. Use alternative CLI commands
2. Use direct API calls
3. Use different MCP functions that are known to work properly

## MCP Running and Debugging Tips

| ISSUE | SOLUTION | DETAILS |
|-------|----------|---------|
| MCP server not using latest code | Run built code directly | `node $REPO_DIR/build/index.js` with environment variables explicitly passed |
| MCP functions quietly failing | Add debug logging to index.ts | Add `console.error()` calls to troubleshoot API requests |
| npx not finding local packages | Use absolute path to built JavaScript | Avoid package resolution issues by directly executing the built file |
| Environment variable issues | Set explicitly when running | `GITLAB_API_URL='https://gitlab.example.com:8443/api/v4' GITLAB_PERSONAL_ACCESS_TOKEN='...' node path/to/build/index.js` |
| Incorrect API URLs | Check GITLAB_API_URL format | Ensure it includes port number and `/api/v4` path but doesn't duplicate components |
| Server-Sent Events (SSE) connection issues | Check supergateway configuration | Ensure proper environment variables are being passed through the SSE proxy |

### GitLab API URL Construction

Proper GitLab API URL construction is critical for successful operations. The standard format is:

```
https://gitlab.example.com[:PORT]/api/v4
```

Key points:
1. Always include the `/api/v4` path in `GITLAB_API_URL`
2. Include port number for non-standard ports: `gitlab.example.com:8443`
3. MCP functions should NOT add another `/api/v4` to the URL
4. Use URL encoding for parameters in path segments
5. Use plural form for resource types (issues, merge_requests)

Example of correct usage:
```
GITLAB_API_URL='https://gitlab.cybersn.com:8443/api/v4' 
```

With this configuration, the URL for the createNote function should be constructed as:
```
${GITLAB_API_URL}/projects/${encodeURIComponent(projectId)}/${noteableType}s/${noteableIid}/notes
```

Which correctly resolves to:
```
https://gitlab.cybersn.com:8443/api/v4/projects/group%2Fproject/issues/2/notes
```