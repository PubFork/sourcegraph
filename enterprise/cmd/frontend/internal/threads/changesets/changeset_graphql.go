package changesets

import (
	"context"
	"path"
	"strconv"

	"github.com/graph-gophers/graphql-go"
	"github.com/graph-gophers/graphql-go/relay"
	"github.com/pkg/errors"
	"github.com/sourcegraph/sourcegraph/cmd/frontend/graphqlbackend"
)

// 🚨 SECURITY: TODO!(sqs): there needs to be security checks everywhere here! there are none

// gqlChangeset implements the GraphQL type Changeset.
type gqlChangeset struct{ db *dbChangeset }

// changesetByID looks up and returns the Changeset with the given GraphQL ID. If no such Changeset exists, it
// returns a non-nil error.
func changesetByID(ctx context.Context, id graphql.ID) (*gqlChangeset, error) {
	dbID, err := unmarshalChangesetID(id)
	if err != nil {
		return nil, err
	}
	return changesetByDBID(ctx, dbID)
}

func (GraphQLResolver) ChangesetByID(ctx context.Context, id graphql.ID) (graphqlbackend.Changeset, error) {
	return changesetByID(ctx, id)
}

// changesetByDBID looks up and returns the Changeset with the given database ID. If no such Changeset exists,
// it returns a non-nil error.
func changesetByDBID(ctx context.Context, dbID int64) (*gqlChangeset, error) {
	v, err := dbChangesets{}.GetByID(ctx, dbID)
	if err != nil {
		return nil, err
	}
	return &gqlChangeset{db: v}, nil
}

func (v *gqlChangeset) ID() graphql.ID {
	return marshalChangesetID(v.db.ID)
}

func marshalChangesetID(id int64) graphql.ID {
	return relay.MarshalID("Changeset", id)
}

func unmarshalChangesetID(id graphql.ID) (dbID int64, err error) {
	err = relay.UnmarshalSpec(id, &dbID)
	return
}

func (GraphQLResolver) ChangesetInRepository(ctx context.Context, repositoryID graphql.ID, number string) (graphqlbackend.Changeset, error) {
	changesetDBID, err := strconv.ParseInt(number, 10, 64)
	if err != nil {
		return nil, err
	}
	// TODO!(sqs): access checks
	changeset, err := changesetByDBID(ctx, changesetDBID)
	if err != nil {
		return nil, err
	}

	// TODO!(sqs): check that the changeset is indeed in the repo. When we make the changeset number
	// sequence per-repo, this will become necessary to even retrieve the changeset. for now, the ID is
	// global, so we need to perform this check.
	assertedRepo, err := graphqlbackend.RepositoryByID(ctx, repositoryID)
	if err != nil {
		return nil, err
	}
	if changeset.db.RepositoryID != assertedRepo.DBID() {
		return nil, errors.New("changeset does not exist in repository")
	}

	return changeset, nil
}

func (v *gqlChangeset) Repository(ctx context.Context) (*graphqlbackend.RepositoryResolver, error) {
	return graphqlbackend.RepositoryByDBID(ctx, v.db.RepositoryID)
}

func (v *gqlChangeset) Number() string { return strconv.FormatInt(v.db.ID, 10) }

func (v *gqlChangeset) DBID() int64 { return v.db.ID }

func (v *gqlChangeset) Title() string { return v.db.Title }

func (v *gqlChangeset) ExternalURL() *string { return v.db.ExternalURL }

func (v *gqlChangeset) URL(ctx context.Context) (string, error) {
	repository, err := v.Repository(ctx)
	if err != nil {
		return "", err
	}
	return path.Join(repository.URL(), "-", "changesets", v.Number()), nil
}

func (v *gqlChangeset) Settings() string {
	if settings := v.db.Settings; settings != nil {
		return *settings
	}
	return "{}"
}

func (v *gqlChangeset) Status() graphqlbackend.ChangesetStatus {
	return v.db.Status
}

func (v *gqlChangeset) RepositoryComparison(ctx context.Context) (*graphqlbackend.RepositoryComparisonResolver, error) {
	settings, err := GetSettings(v)
	if err != nil {
		return nil, err
	}
	if settings.Delta == nil {
		return nil, nil
	}

	repo, err := v.Repository(ctx)
	if err != nil {
		return nil, err
	}
	return graphqlbackend.NewRepositoryComparison(ctx, repo, &graphqlbackend.RepositoryComparisonInput{
		Base: &settings.Delta.Base,
		Head: &settings.Delta.Head,
	})
}