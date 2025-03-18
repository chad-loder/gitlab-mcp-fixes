# Better GitLab MCP Server

## @zereight/mcp-gitlab

[![smithery badge](https://smithery.ai/badge/@zereight/gitlab-mcp)](https://smithery.ai/server/@zereight/gitlab-mcp)

GitLab MCP(Model Context Protocol) Server. **Includes bug fixes and improvements over the original GitLab MCP server.**

<a href="https://glama.ai/mcp/servers/7jwbk4r6d7"><img width="380" height="200" src="https://glama.ai/mcp/servers/7jwbk4r6d7/badge" alt="gitlab mcp MCP server" /></a>

## Usage

### Using with Claude App, Cline, Roo Code

When using with the Claude App, you need to set up your API key and URLs directly.

```json
{
  "mcpServers": {
    "GitLab communication server": {
      "command": "npx",
      "args": ["-y", "@zereight/mcp-gitlab"],
      "env": {
        "GITLAB_PERSONAL_ACCESS_TOKEN": "your_gitlab_token",
        "GITLAB_API_URL": "your_gitlab_api_url"
      }
    }
  }
}
```

### Using with Cursor

When using with Cursor, you can set up environment variables and run the server as follows:

```
env GITLAB_PERSONAL_ACCESS_TOKEN=your_gitlab_token GITLAB_API_URL=your_gitlab_api_url npx @zereight/mcp-gitlab
```

- `GITLAB_PERSONAL_ACCESS_TOKEN`: Your GitLab personal access token.
- `GITLAB_API_URL`: Your GitLab API URL. (Default: `https://gitlab.com/api/v4`)

## Tools 🛠️

1. `create_or_update_file`

   - Create or update a single file in a GitLab project. 📝
   - Inputs:
     - `project_id` (string): Project ID or namespace/project_path
     - `file_path` (string): Path to create/update the file
     - `content` (string): File content
     - `commit_message` (string): Commit message
     - `branch` (string): Branch to create/update the file in
     - `previous_path` (optional string): Previous file path when renaming a file
   - Returns: File content and commit details

2. `push_files`

   - Push multiple files in a single commit. 📤
   - Inputs:
     - `project_id` (string): Project ID or namespace/project_path
     - `branch` (string): Branch to push to
     - `files` (array): Array of files to push, each with `file_path` and `content` properties
     - `commit_message` (string): Commit message
   - Returns: Updated branch reference

3. `search_repositories`

   - Search for GitLab projects. 🔍
   - Inputs:
     - `search` (string): Search query
     - `page` (optional number): Page number (default: 1)
     - `per_page` (optional number): Results per page (default: 20, max: 100)
   - Returns: Project search results

4. `create_repository`

   - Create a new GitLab project. ➕
   - Inputs:
     - `name` (string): Project name
     - `description` (optional string): Project description
     - `visibility` (optional string): Project visibility level (public, private, internal)
     - `initialize_with_readme` (optional boolean): Initialize with README
   - Returns: Details of the created project

5. `get_file_contents`

   - Get the contents of a file or directory. 📂
   - Inputs:
     - `project_id` (string): Project ID or namespace/project_path
     - `file_path` (string): Path to the file/directory
     - `ref` (optional string): Branch, tag, or commit SHA (default: default branch)
   - Returns: File/directory content

6. `create_issue`

   - Create a new issue. 🐛
   - Inputs:
     - `project_id` (string): Project ID or namespace/project_path
     - `title` (string): Issue title
     - `description` (string): Issue description
     - `assignee_ids` (optional number[]): Array of assignee IDs
     - `milestone_id` (optional number): Milestone ID
     - `labels` (optional string[]): Array of labels
   - Returns: Details of the created issue

7. `create_merge_request`

   - Create a new merge request. 🚀
   - Inputs:
     - `project_id` (string): Project ID or namespace/project_path
     - `title` (string): Merge request title
     - `description` (string): Merge request description
     - `source_branch` (string): Branch with changes
     - `target_branch` (string): Branch to merge into
     - `allow_collaboration` (optional boolean): Allow collaborators to push commits to the source branch
     - `draft` (optional boolean): Create as a draft merge request
   - Returns: Details of the created merge request

8. `fork_repository`

   - Fork a project. 🍴
   - Inputs:
     - `project_id` (string): Project ID or namespace/project_path to fork
     - `namespace` (optional string): Namespace to fork into (default: user namespace)
   - Returns: Details of the forked project

9. `create_branch`

   - Create a new branch. 🌿
   - Inputs:
     - `project_id` (string): Project ID or namespace/project_path
     - `branch` (string): New branch name
     - `ref` (optional string): Ref to create the branch from (branch, tag, commit SHA, default: default branch)
   - Returns: Created branch reference

10. `get_merge_request`

    - Get details of a merge request. ℹ️
    - Inputs:
      - `project_id` (string): Project ID or namespace/project_path
      - `merge_request_iid` (number): Merge request IID
    - Returns: Merge request details

11. `get_merge_request_diffs`

    - Get changes (diffs) of a merge request. diff
    - Inputs:
      - `project_id` (string): Project ID or namespace/project_path
      - `merge_request_iid` (number): Merge request IID
      - `view` (optional string): Diff view type ('inline' or 'parallel')
    - Returns: Array of merge request diff information

12. `update_merge_request`

    - Update a merge request. 🔄
    - Inputs:
      - `project_id` (string): Project ID or namespace/project_path
      - `merge_request_iid` (number): Merge request IID
      - `title` (optional string): New title
      - `description` (string): New description
      - `target_branch` (optional string): New target branch
      - `state_event` (optional string): Merge request state change event ('close', 'reopen')
      - `remove_source_branch` (optional boolean): Remove source branch after merge
      - `allow_collaboration` (optional boolean): Allow collaborators to push commits to the source branch
    - Returns: Updated merge request details

13. `create_note`

    - Create a new note (comment) to an issue or merge request. 💬
    - Inputs:
      - `project_id` (string): Project ID or namespace/project_path
      - `noteable_type` (string): Type of noteable ("issue" or "merge_request")
      - `noteable_iid` (number): IID of the issue or merge request
      - `body` (string): Note content
    - Returns: Details of the created note

14. `list_issues`

    - List issues in a GitLab project with filtering options. 📋
    - Inputs:
      - `project_id` (string): Project ID or namespace/project_path
      - `state` (optional string): Issue state ('opened', 'closed', 'all')
      - `page` (optional number): Page number for pagination
      - `per_page` (optional number): Number of items per page
      - Other optional filtering parameters
    - Returns: Array of issue objects

15. `get_issue`

    - Get details of a specific issue. ℹ️
    - Inputs:
      - `project_id` (string): Project ID or namespace/project_path
      - `issue_iid` (number): Issue IID
    - Returns: Issue details

16. `update_issue`

    - Update an existing issue. 🔄
    - Inputs:
      - `project_id` (string): Project ID or namespace/project_path
      - `issue_iid` (number): Issue IID
      - `title` (optional string): New title
      - `description` (optional string): New description
      - Various optional parameters
    - Returns: Updated issue details

17. `delete_issue`

    - Delete an issue from a project. 🗑️
    - Inputs:
      - `project_id` (string): Project ID or namespace/project_path
      - `issue_iid` (number): Issue IID
    - Returns: Success status

18. `list_issue_links`

    - List all issue links for a specific issue. 🔗
    - Inputs:
      - `project_id` (string): Project ID or namespace/project_path
      - `issue_iid` (number): Issue IID
    - Returns: Array of issue link objects

19. `get_issue_link`

    - Get details about a specific issue link. ℹ️
    - Inputs:
      - `project_id` (string): Project ID or namespace/project_path
      - `issue_iid` (number): Issue IID
      - `issue_link_id` (number): Issue link ID
    - Returns: Issue link details

20. `create_issue_link`

    - Create a link between two issues. 🔗
    - Inputs:
      - `project_id` (string): Project ID or namespace/project_path
      - `issue_iid` (number): Issue IID
      - `target_project_id` (string): Target project ID
      - `target_issue_iid` (number): Target issue IID
      - `link_type` (optional string): Link type ('relates_to', 'blocks', or 'is_blocked_by')
    - Returns: Created issue link details

21. `delete_issue_link`

    - Delete a link between issues. 🗑️
    - Inputs:
      - `project_id` (string): Project ID or namespace/project_path
      - `issue_iid` (number): Issue IID
      - `issue_link_id` (number): Issue link ID
    - Returns: Success status

22. `list_namespaces`

    - List all available namespaces. 📋
    - Inputs:
      - `search` (optional string): Filter namespaces by search query
      - `page` (optional number): Page number
      - `per_page` (optional number): Results per page
      - `owned` (optional boolean): Only show owned namespaces
    - Returns: Array of namespace objects

23. `get_namespace`

    - Get details about a specific namespace. ℹ️
    - Inputs:
      - `namespace_id` (string): ID or path of the namespace
    - Returns: Namespace details

24. `verify_namespace`

    - Verify if a namespace path exists. ✓
    - Inputs:
      - `path` (string): Namespace path to verify
    - Returns: Verification result with exists flag

25. `get_project`

    - Get detailed information about a specific project. ℹ️
    - Inputs:
      - `project_id` (string): Project ID or namespace/project_path
    - Returns: Project details

26. `list_projects`

    - List GitLab projects with filtering options. 📋
    - Inputs:
      - Various optional filtering parameters
    - Returns: Array of project objects

27. `list_collections`

    - List all available documentation collections. 📚
    - Inputs: None
    - Returns: Array of collection objects with ID, name, and description

28. `list_resources`

    - List all resources in a specific collection. 📚
    - Inputs:
      - `collection_id` (string): The ID of the collection to list resources from
    - Returns: Array of resource objects

29. `read_resource`

    - Read the content of a specific resource. 📄
    - Inputs:
      - `collection_id` (string): The ID of the collection containing the resource
      - `resource_id` (string): The ID of the resource to read
    - Returns: Resource content and metadata

30. `search_resources`

    - Search for content within a collection's resources with advanced options. 🔍
    - Inputs:
      - `collection_id` (string): The ID of the collection to search in
      - `query` (string): The search query to find in resources
      - `limit` (optional number): Maximum number of results to return (default: 10)
      - `fuzzy` (optional number): Fuzzy search tolerance, between 0 and 1 (default: 0.2)
      - `prefix` (optional boolean): Whether to perform prefix matching (default: true)
      - `boost` (optional object): Custom boost factors for specific fields:
        - `title` (optional number): Boost factor for title field (default: 8)
        - `parameterData` (optional number): Boost factor for parameter data field (default: 3)
        - `content` (optional number): Boost factor for content field (default: 1)
      - `fields` (optional array): Fields to search in (default: all fields)
    - Returns: Array of matching resources with relevance scores and snippets

## Environment Variable Configuration

Before running the server, you need to set the following environment variables:

```
GITLAB_PERSONAL_ACCESS_TOKEN=your_gitlab_token
GITLAB_API_URL=your_gitlab_api_url  # Default: https://gitlab.com/api/v4
```

## License

MIT License
