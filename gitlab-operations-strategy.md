# Token-Efficient GitLab Operations Meta-Strategy

> **Last Updated: March 18, 2024**

> **PATH HANDLING RULE**: Always use absolute paths (e.g., `/Users/username/path`) rather than relative paths or shell expansions (`~`, `.`) when passing file paths between tools. Shell expansions like `~` are not processed by MCP functions and will either cause file not found errors OR create literal directories named `~` in the current working directory. This can lead to silent failures where operations happen in the wrong location.

## Critical Patterns

| COMMAND CONTEXT | REQUIRED PATTERN | EXAMPLE | RATIONALE |
|-----------------|-----------------|---------|-----------|
| List or view operations | Add `--output json` flag | `glab mr list --output json` | Prevents pager issues, ensures parseable output |
| Field selection | Check API documentation first | `glab mr list --help | cat` | Field names vary between commands |
| ID referencing | Use IID from list output, never raw numbers | `iid=$(glab mr list --output json | jq -r '.[0].iid')` | IIDs may not be consistent across views |
| CI pipeline runs | Use `--ref` parameter for target branch | `glab ci run --ref main` | Required for specifying execution branch |
| Help documentation | Add pipe to cat: `command --help | cat` | `glab mr list --help | cat` | Prevents pager interference |
| MR operations | Use variables from previous operations | `glab mr view "$iid" --output json` | Prevents hardcoded assumptions |
| Non-repository contexts | Add `GITLAB_HOST=hostname` prefix | `GITLAB_HOST=gitlab.example.com glab mr list` | Explicit instance targeting |

## Common Mistakes to Avoid

| ❌ INCORRECT PATTERN | ✅ CORRECT PATTERN | EXPLANATION |
|---------------------|-------------------|-------------|
| `glab mr list --json id,status` | `glab mr list --output json` | Use full JSON flag instead of field selection |
| `glab mr view 123` | `glab mr view "$iid" --output json` | Use variables instead of hardcoded IDs |
| `glab ci run workflow.yml --json` | `glab ci run workflow.yml --ref main` | Add required branch parameter |
| `glab mr list | cat` | `glab mr list --output json --per-page 30` | Use JSON with pagination instead of text piping |
| `glab mr view $id` | `glab mr view "$iid" --output json` | Quote variables and use correct output format |
| `gh` commands | `glab` commands | Use GitLab-specific CLI tool |
| `--repo` parameter | `-R` parameter | Use correct GitLab CLI parameter format |

## Core Decision Rules

### Command Selection Logic

| OPERATION TYPE | CONDITION | USE THIS | AVOID THIS |
|----------------|-----------|----------|------------|
| Any GitLab CLI command | Command supports `--output json` flag | Add `--output json` flag | Default text output |
| File operations (single file) | File path known | `mcp_GitLab_create_or_update_file` | Direct Git commands |
| File operations (multiple files) | Files in same repository | `mcp_GitLab_push_files` | Multiple single-file operations |
| Repository creation | Standard repository needed | `mcp_GitLab_create_repository` | `glab repo create` |
| Repository forking | Fork to same GitLab instance | `mcp_GitLab_fork_repository` | `glab repo fork` |
| Branch creation | Creating from known ref | `mcp_GitLab_create_branch` | `git branch` + `git push` |
| Issue creation | Project ID known | `mcp_GitLab_create_issue` | `glab issue create` |
| Merge request creation | Requires custom parameters | `glab mr create` | `mcp_GitLab_create_merge_request` |
| Existing merge request management | MR ID/IID known | `glab mr [command] --output json` | `mcp_GitLab_get_merge_request` |
| Repository search | Simple query needed | `mcp_GitLab_search_repositories` | `glab repo list` |
| Comment/note addition | Issue/MR ID known | `mcp_GitLab_create_note` | `glab api` endpoints |
| Running outside Git repo | Any command | Prefix with `GITLAB_HOST=hostname` | Default host detection |
| Batch operations | Operating on >3 repositories | `glab` with shell scripting | MCP functions |

### Parameter Selection Logic

| PARAMETER CONTEXT | REQUIRED VALUES | OPTIONAL VALUES | NEVER USE |
|-------------------|-----------------|----------------|-----------|
| Project identifiers | Always use `project_id` | - | Numeric IDs without context |
| MR/Issue identifiers | Always use IID (not ID) | - | Global numeric IDs |
| File paths | Full absolute paths | - | `~` or relative paths |
| Branch references | Explicit branch names | - | HEAD references |
| Pagination | `--per-page` with explicit limit | `page` parameter | Unlimited result sets |
| Authentication | Environment variables | - | Hardcoded tokens |
| GitLab instances | `GITLAB_HOST` with port if needed | - | Default host assumptions |
| Output format | `--output json` for all list/view | - | Default text output formats |

## GitLab CLI Non-Interactive Usage Patterns

| OPERATION | COMMAND PATTERN | EXAMPLE |
|-----------|----------------|---------|
| List merge requests | `glab mr list --output json --per-page N` | `glab mr list --output json --per-page 30` |
| View merge request details | `glab mr view [IID] --output json` | `glab mr view 123 --output json` |
| Merge request approval | `glab mr merge [IID] --remove-source-branch` | `glab mr merge 123 --remove-source-branch` |
| List pipelines | `glab ci list --output json --per-page N` | `glab ci list --output json --per-page 30` |
| View pipeline details | `glab ci view [PIPELINE_ID] --output json` | `glab ci view 12345 --output json` |
| Run pipeline | `glab ci run --ref [BRANCH] --variables [VARS]` | `glab ci run --ref main --variables "VAR1:value1"` |
| Direct API access | `glab api [ENDPOINT]` | `glab api projects/12345/issues` |
| Filter API responses | `glab api [ENDPOINT] | jq '[FILTER]'` | `glab api projects/12345/issues | jq '.[] | select(.state=="opened")'` |

## Critical Guidelines for Non-Interactive Usage

| CONTEXT | DO THIS | DON'T DO THIS | REASON |
|---------|---------|--------------|--------|
| Output format | Use `--output json` flag | Use default text output | Prevents pager issues, ensures parseable data |
| Data extraction | Use jq with JSON output | Parse text output | More reliable, handles escaping properly |
| Log viewing | Add redirection (`| cat`) | View logs directly | Prevents interactive pager prompts |
| Content editing | Use non-interactive flags | Allow interactive prompts | Prevents hanging in non-TTY contexts |
| Authentication | Use environment variables | Use `glab auth login` | Environment variables work in all contexts |
| Error handling | Capture stderr with redirection | Allow stderr to mix with stdout | Enables proper error detection |
| Confirmations | Add explicit flags (e.g., `--remove-source-branch`) | Use default behaviors | Avoids interactive confirmation prompts |
| Result pagination | Specify `--per-page` parameter | Request unlimited results | Prevents pagination prompts |
| Editor invocation | Set `GIT_EDITOR=true` | Allow default editor | Prevents hanging on editor invocation |
| GitLab instance | Set `GITLAB_HOST` explicitly | Rely on auto-detection | Ensures targeting correct instance |

## Safe Authentication Options

> **⚠️ CRITICAL SECURITY NOTE**: NEVER echo, log, or store personal access tokens in scripts, log files, or any persistent storage without explicit user permission. Tokens should be handled using secure environment variables or trusted secret management systems only. Accidental exposure of tokens can lead to unauthorized access to repositories, pipelines, and sensitive data.

| AUTHENTICATION CONTEXT | RECOMMENDED APPROACH | EXAMPLE | AVOID |
|------------------------|---------------------|---------|-------|
| Script authentication | Environment variables | `export GITLAB_TOKEN=your_token` | Hardcoded tokens |
| Status checking | Redirection with filtering | `glab auth status 2>&1 | grep -v "Token"` | Direct output display |
| Account switching | Replace environment variable | `export GITLAB_TOKEN=new_token` | `glab auth login` |
| Different token scopes | Use pre-configured tokens | Generate token with required scopes | Interactive scope changes |
| Cross-host operations | Specify host explicitly | `GITLAB_HOST=gitlab.example.com glab repo clone group/project` | Default host inference |
| Self-hosted GitLab | Use GITLAB_HOST with port | `GITLAB_HOST=gitlab.cybersn.com:8443 glab issue list -R group/project` | Default instance assumptions |

## MCP Function Reference

| FUNCTION | PARAMETERS | USE CASE | NOTES |
|----------|------------|----------|-------|
| `mcp_GitLab_create_or_update_file` | project_id, file_path, content, commit_message, branch | Single file creation/update | File path must be absolute |
| `mcp_GitLab_get_file_contents` | project_id, file_path, [ref] | Retrieve file content | Optional ref defaults to main/master |
| `mcp_GitLab_push_files` | project_id, branch, files, commit_message | Multi-file commits | Use for batch operations |
| `mcp_GitLab_create_repository` | name, [description], [visibility] | Create new repository | visibility: public, private, internal |
| `mcp_GitLab_fork_repository` | project_id, [namespace] | Fork existing repository | Defaults to user namespace |
| `mcp_GitLab_create_branch` | project_id, branch, [ref] | Create new branch | Optional ref defaults to default branch |
| `mcp_GitLab_create_issue` | project_id, title, [description], [assignee_ids], [labels] | Create issue | Works with numeric ID or path format |
| `mcp_GitLab_create_note` | project_id, noteable_type, noteable_iid, body | Add comment to issue/MR | noteable_type: 'issue' or 'merge_request' |
| `mcp_GitLab_search_repositories` | search, [page], [per_page] | Search for repositories | Supports pagination |

### Known Problematic Functions

| FUNCTION | ALTERNATIVE APPROACH | REASON |
|----------|----------------------|--------|
| `mcp_GitLab_create_merge_request` | `glab mr create --source-branch X --target-branch Y` | Parameter validation issues |
| `mcp_GitLab_get_merge_request` | `glab api "projects/PROJECT_ID/merge_requests/MR_IID"` | Strict parameter requirements |

## Token-Efficient Response Processing

| DATA SOURCE | PROCESSING APPROACH | EXAMPLE | BENEFIT |
|-------------|---------------------|---------|---------|
| MCP function response | Use structured JSON directly | Parse response object | Pre-validated data structure |
| `glab` JSON output | Parse complete response | `glab mr list --output json | jq .` | Full data structure available |
| Field extraction | Use jq with specific paths | `--output json | jq '.[] | {id: .iid, title: .title}'` | Minimizes response size |
| Filtered results | Use jq with conditions | `--output json | jq '.[] | select(.state=="opened")'` | Server-side filtering not required |
| Large data sets | Add pagination parameters | `--per-page 10 --page 1` | Prevents memory issues |
| Error detection | Check exit codes and stderr | `if [ $? -ne 0 ]; then echo "Error"; fi` | Reliable error handling |
| Combining responses | Use jq to merge objects | `jq -s '.[0] * .[1]'` | Creates composite responses |

## Command Cheat Sheet

### File Operations
```bash
# Create or update file
mcp_GitLab_create_or_update_file project_id="12345" file_path="path/to/file.txt" content="file content" commit_message="commit message" branch="main"

# Get file contents
mcp_GitLab_get_file_contents project_id="12345" file_path="path/to/file.txt"
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
mcp_GitLab_create_repository name="new-repo" description="Description" visibility="private"

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

| OPERATION | RISK FACTOR | REQUIRED SAFEGUARDS | IMPLEMENTATION APPROACH |
|-----------|-------------|---------------------|-------------------------|
| Force push to protected branches | History rewriting | Explicit permission | Clearly explain consequences before execution |
| Token handling | Security exposure | Token scope verification | Use environment variables, never display full tokens |
| Repository deletion | Permanent data loss | Multiple confirmations | Require explicit written confirmation before proceeding |
| Batch file operations | Mass changes | File list review | Summarize all affected files before execution |
| Pipeline triggering | Process initiation | Branch verification | Verify target branch and variables before running |
| Enterprise-level changes | Wide-reaching impact | Admin confirmation | Document all affected repositories before proceeding |
| Webhook creation | Security implications | Endpoint verification | Validate webhook destination URLs |
| Mutation API calls | Direct data changes | Method confirmation | Highlight all POST/PATCH/DELETE operations for review |
| Authentication context changes | Wrong account actions | Identity verification | Display current user before each critical operation |
| Secret management | Credential exposure | Value masking | Use file input rather than command-line parameters |
| Variable deletion | Lost configuration | Name confirmation | Verify exact variable name before deletion |

## GitLab Variables (Secrets) Management

| OPERATION | COMMAND PATTERN | EXAMPLE | SECURITY CONSIDERATION |
|-----------|----------------|---------|------------------------|
| List variables | `glab variable list [scope]` | `glab variable list -g group_id` | Group/project scope affects visibility |
| Create variable | Redirect from file | `glab variable create API_KEY < key.txt` | Never include values in command line |
| Set from environment | Shell redirection | `echo $VALUE | glab variable create SECRET_NAME` | Prevents command history exposure |
| Delete variable | Explicit name | `glab variable delete VARIABLE_NAME` | Get confirmation before proceeding |
| Group-level variables | Add `-g` flag | `glab variable list -g my-group-id` | Requires appropriate permissions |
| Environment variables | Add `-e` flag | `glab variable create API_KEY -e production < key.txt` | Affects specific environment only |
| Rotating credentials | Update existing name | `glab variable create API_KEY < new_key.txt` | Check dependent pipelines |

### Secure Temporary File Pattern

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

### Random Secret Generation Pattern

```bash
# Generate random secret with standardized length (32-64 chars) and pipe directly to glab
glab variable create API_KEY < <(pwgen -s $(( (RANDOM % (64 - 32 + 1)) + 32 )) 1)
```

## MCP Known Issues and Workarounds

| ISSUE | AFFECTED COMPONENT | WORKAROUND | TECHNICAL DETAILS |
|-------|-------------------|------------|-------------------|
| Parameter validation errors | `mcp_GitLab_create_merge_request` | Use `glab mr create` | Function requires undocumented parameters like `diff_refs` |
| Strict response validation | `mcp_GitLab_get_merge_request` | Use `glab api` endpoint | Use: `glab api "projects/PROJECT_ID/merge_requests/MR_IID"` |
| Artifact download failures | GitLab job artifacts | Use direct API with port | `glab api "projects/PROJECT_ID/jobs/JOB_ID/artifacts" > artifacts.zip` |
| Non-standard ports | Self-hosted GitLab | Add port to host definition | Format: `GITLAB_HOST=gitlab.example.com:PORT` |
| Server startup issues | MCP server scripts | Execute built code directly | Use `node $REPO_DIR/build/index.js` with explicit env vars |

### MCP Configuration for SSH-Proxied GitLab

| REQUIREMENT | IMPLEMENTATION | EXAMPLE |
|-------------|----------------|---------|
| Port specification | Add port to GITLAB_HOST | `GITLAB_HOST=gitlab.example.com:8443` |
| Artifact access | Use API with proper port | `glab api "projects/PROJECT_ID/jobs/JOB_ID/artifacts" > artifacts.zip` |
| Pipeline verification | Check completion status first | `glab ci view $pipeline_id --output json | jq .status` |
| Fallback strategy | CLI commands with port | Specify port in all GITLAB_HOST variables |

### MCP Implementation Considerations

When troubleshooting MCP functions, consider these potential issues:
1. Schema validation requirements vs. actual implementation
2. Null-value handling in response validation
3. Environment variable configuration errors

Recommended troubleshooting sequence:
1. Check error message for specific validation errors
2. Try alternative CLI command with identical parameters
3. Use direct API endpoint if MCP function fails
4. Use working MCP functions when available

### GitLab API URL Format

```
https://gitlab.example.com[:PORT]/api/v4
```

Key formatting requirements:
- Always include `/api/v4` path in GITLAB_API_URL
- Include port number for non-standard ports
- Use URL encoding for path parameters
- Use plural form for resource types (issues, merge_requests)

Example environment variable configuration:
```bash
export GITLAB_API_URL='https://gitlab.example.com:8443/api/v4'
export GITLAB_PERSONAL_ACCESS_TOKEN='YOUR_TOKEN'
```
