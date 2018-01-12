import DirectionalSignIcon from '@sourcegraph/icons/lib/DirectionalSign'
import RepoIcon from '@sourcegraph/icons/lib/Repo'
import * as React from 'react'
import { RouteComponentProps } from 'react-router'
import { defer } from 'rxjs/observable/defer'
import { delay } from 'rxjs/operators/delay'
import { distinctUntilChanged } from 'rxjs/operators/distinctUntilChanged'
import { retryWhen } from 'rxjs/operators/retryWhen'
import { switchMap } from 'rxjs/operators/switchMap'
import { tap } from 'rxjs/operators/tap'
import { Subject } from 'rxjs/Subject'
import { Subscription } from 'rxjs/Subscription'
import { HeroPage } from '../components/HeroPage'
import { ChromeExtensionToast, FirefoxExtensionToast } from '../marketing/BrowserExtensionToast'
import { SurveyToast } from '../marketing/SurveyToast'
import { IS_CHROME, IS_FIREFOX } from '../marketing/util'
import { CopyLinkAction } from './actions/CopyLinkAction'
import { GoToPermalinkAction } from './actions/GoToPermalinkAction'
import { ECLONEINPROGESS, EREPONOTFOUND, EREVNOTFOUND, ERREPOSEEOTHER, RepoSeeOtherError, resolveRev } from './backend'
import { BlobPage } from './BlobPage'
import { DirectoryPage } from './DirectoryPage'
import { RepoHeaderActionPortal } from './RepoHeaderActionPortal'
import { RepoRevSidebar } from './RepoRevSidebar'
import { RevSwitcher } from './RevSwitcher'

interface Props extends RouteComponentProps<{ filePath: string }> {
    repo: GQL.IRepository
    rev: string | undefined
    user: GQL.IUser | null
    objectType: 'blob' | 'tree'
}

interface State {
    loading: boolean
    showSidebar: boolean

    error?: { message: string } | 'repo-not-found'
    cloneInProgress?: boolean
    commitID?: string
    defaultBranch?: string
}

/**
 * A container for a repository page that incorporates revisioned Git data. (For example,
 * blob and tree pages are revisioned, but the repository settings page is not.)
 */
export class RepoRevContainer extends React.PureComponent<Props, State> {
    public state: State = {
        loading: true,
        showSidebar: true,
    }

    private repoRevChanges = new Subject<{ repo: string; rev: string | undefined }>()
    private subscriptions = new Subscription()

    public componentDidMount(): void {
        // Fetch repository revision.
        this.subscriptions.add(
            this.repoRevChanges
                .pipe(
                    distinctUntilChanged(),
                    tap(() =>
                        this.setState({
                            error: undefined,
                            cloneInProgress: undefined,
                            commitID: undefined,
                            defaultBranch: undefined,
                        })
                    ),
                    switchMap(({ repo, rev }) =>
                        defer(() => resolveRev({ repoPath: repo, rev: rev || 'HEAD' }))
                            // On a CloneInProgress error, retry after 1s
                            .pipe(
                                retryWhen(errors =>
                                    errors.pipe(
                                        tap(err => {
                                            switch (err.code) {
                                                case ERREPOSEEOTHER:
                                                    const externalHostURL = new URL(
                                                        (err as RepoSeeOtherError).redirectURL
                                                    )
                                                    const redirectURL = new URL(window.location.href)
                                                    // Preserve the path of the current URL and redirect to the repo on the external host.
                                                    redirectURL.host = externalHostURL.host
                                                    redirectURL.port = externalHostURL.port
                                                    redirectURL.protocol = externalHostURL.protocol
                                                    window.location.href = redirectURL.toString()
                                                case EREPONOTFOUND:
                                                    // Display 404 to the user and do not retry
                                                    this.setState({ loading: false, error: 'repo-not-found' })
                                                    break
                                                case ECLONEINPROGESS:
                                                    // Display cloning screen to the user and retry
                                                    this.setState({
                                                        loading: false,
                                                        error: undefined,
                                                        cloneInProgress: true,
                                                    })
                                                    return
                                                case EREVNOTFOUND:
                                                    // Display 404 to the user and do not retry
                                                    this.setState({ loading: false, cloneInProgress: undefined })
                                                    break
                                            }
                                            // Don't retry
                                            throw err
                                        }),
                                        delay(1000)
                                    )
                                )
                            )
                    )
                )
                .subscribe(
                    ({ commitID, defaultBranch }) =>
                        this.setState({
                            loading: false,
                            commitID,
                            defaultBranch,
                            error: undefined,
                            cloneInProgress: undefined,
                        }),
                    err =>
                        this.setState({ loading: false, error: { message: err.message }, cloneInProgress: undefined })
                )
        )
        this.repoRevChanges.next({ repo: this.props.repo.uri, rev: this.props.rev })
    }

    public componentWillReceiveProps(props: Props): void {
        if (props.repo !== this.props.repo || props.rev !== this.props.rev) {
            this.repoRevChanges.next({ repo: props.repo.uri, rev: props.rev })
        }
    }

    public componentWillUnmount(): void {
        this.subscriptions.unsubscribe()
    }

    public render(): JSX.Element | null {
        if (this.state.loading) {
            return null // loading
        }

        if (this.state.cloneInProgress) {
            return (
                <HeroPage
                    icon={RepoIcon}
                    title={this.props.repo.uri
                        .split('/')
                        .slice(1)
                        .join('/')}
                    subtitle="Cloning in progress"
                />
            )
        }
        if (this.state.error === 'repo-not-found') {
            return (
                <HeroPage
                    icon={DirectionalSignIcon}
                    title="404: Not Found"
                    subtitle="The requested repository was not found."
                />
            )
        }
        if (!this.state.commitID) {
            return (
                <HeroPage
                    icon={DirectionalSignIcon}
                    title="404: Not Found"
                    subtitle="The requested revision was not found."
                />
            )
        }
        if (this.state.error) {
            return <HeroPage icon={RepoIcon} title="Error" subtitle={this.state.error.message} />
        }

        return (
            <div className="repo-rev-container">
                {IS_CHROME && <ChromeExtensionToast />}
                {IS_FIREFOX && <FirefoxExtensionToast />}
                <SurveyToast />
                <RepoHeaderActionPortal
                    position="path"
                    element={<CopyLinkAction key="copy-link" location={this.props.location} />}
                />
                <RepoHeaderActionPortal
                    position="left"
                    element={
                        <RevSwitcher
                            key="rev-switcher"
                            repoPath={this.props.repo.uri}
                            rev={this.props.rev || this.state.defaultBranch || 'HEAD'}
                            history={this.props.history}
                        />
                    }
                />
                <RepoHeaderActionPortal
                    position="left"
                    element={
                        <GoToPermalinkAction
                            key="go-to-permalink"
                            rev={this.props.rev}
                            commitID={this.state.commitID}
                            location={this.props.location}
                            history={this.props.history}
                        />
                    }
                />
                <RepoRevSidebar
                    className="repo-rev-container__sidebar"
                    repoPath={this.props.repo.uri}
                    rev={this.props.rev}
                    commitID={this.state.commitID}
                    filePath={this.props.match.params.filePath || ''}
                    defaultBranch={this.state.defaultBranch || 'HEAD'}
                    history={this.props.history}
                />
                <div className="repo-rev-container__content">
                    {this.props.objectType === 'tree' && (
                        <DirectoryPage
                            repoPath={this.props.repo.uri}
                            commitID={this.state.commitID}
                            rev={this.props.rev}
                            filePath={this.props.match.params.filePath || ''}
                        />
                    )}
                    {this.props.objectType === 'blob' && (
                        <BlobPage
                            repoPath={this.props.repo.uri}
                            commitID={this.state.commitID}
                            rev={this.props.rev}
                            filePath={this.props.match.params.filePath || ''}
                            location={this.props.location}
                            history={this.props.history}
                        />
                    )}
                </div>
            </div>
        )
    }
}
