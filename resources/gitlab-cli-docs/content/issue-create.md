# Create Issue

## Synopsis

Create a new issue

```
glab issue create [flags]
```

## Description

Create a new issue in the repository.

## Examples

```bash
# Create issue with title and description
$ glab issue create --title "I found a bug" --description "Everything broke"

# Create issue with labels
$ glab issue create --label bug --label "help wanted"

# Create issue and assign it to people
$ glab issue create --assignee monalisa,hubot

# Create issue with milestone
$ glab issue create --milestone release-2.0

# Create issue with due date
$ glab issue create --due-date 2020-12-31

# Open issue in web browser after creation
$ glab issue create --web
```

## Options

```
  -a, --assignee strings      Assign issue to people by their usernames
      --confidential          Set issue to be confidential
  -d, --description string    Supply a description for issue
      --due-date string       The date and time the issue is due in ISO 8601 format: 2019-03-15T08:00:00Z
  -l, --label strings         Add labels by name
  -m, --milestone string      The global ID or title of a milestone to assign
      --linked-mr int         The IID of a merge request to link to this issue
  -t, --title string          Supply a title for issue
  -w, --web                   Open the issue in your web browser
  -y, --yes                   Skip submission confirmation prompt
```

## See Also

* [glab issue](issue.md) - Create, view and manage issues 
