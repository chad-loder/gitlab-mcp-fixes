# Create Merge Request

## Synopsis

Create a new merge request

```
glab mr create [flags]
```

## Description

Create a new merge request in the repository.

## Examples

```bash
# Create a merge request using the title and description from the commit message
$ glab mr create --fill

# Create a merge request whith a specific title and description
$ glab mr create --title "Fix bug" --description "This fixes the bug"

# Create a merge request and assign it to a user
$ glab mr create --assignee=username

# Create a merge request with labels
$ glab mr create --label bug --label "feature request"
```

## Options

```
  -a, --assignee strings       Assign merge request to people by their usernames
      --draft                  Mark merge request as a draft
  -d, --description string     Supply a description for merge request
  -f, --fill                   Fill fields from commit message
  -l, --label strings          Add labels by name
  -m, --milestone string       Set milestone by name
      --recover string         Recover input from a failed merge request (ID)
  -s, --source-branch string   The branch you're planning to merge from
  -t, --target-branch string   The branch you're planning to merge into
      --title string           Supply a title for merge request
  -w, --web                    Open the merge request on your web browser
  -y, --yes                    Skip submission confirmation prompt
```

## See Also

* [glab mr](mr.md) - Create, view and manage merge requests 
