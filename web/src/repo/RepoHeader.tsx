import GearIcon from '@sourcegraph/icons/lib/Gear'
import * as H from 'history'
import * as React from 'react'
import { NavLink } from 'react-router-dom'
import { Subject } from 'rxjs/Subject'
import { AnonymousSubscription, Subscription } from 'rxjs/Subscription'
import { RepoBreadcrumb } from '../components/Breadcrumb'

/**
 * An action link that is added to and displayed in the repository header.
 */
export interface RepoHeaderAction {
    position: 'path' | 'left' | 'right'
    element: React.ReactElement<any>
}

interface Props {
    /**
     * The repository that this header is for.
     */
    repo: GQL.IRepository | { uri: string; viewerCanAdminister: boolean }

    /**
     * An optional class name to add to the element.
     */
    className?: string

    /**
     * Do not include links in breadcrumb. Intended when the repository is not available on the
     * server.
     */
    disableLinks?: boolean

    // These two props (rev and filePath) technically violate separation of concerns because they
    // are for "repo revs" not just "repos". But it's much simpler and just requires lexicographic
    // operations to compute them even outside of the RepoRevContainer.
    rev: string | undefined
    filePath: string | undefined

    location: H.Location
    history: H.History
}

interface State {
    /**
     * Actions to display just after the path (braedcrumb) in the header.
     */
    pathActions?: RepoHeaderAction[]

    /**
     * Actions to display on the left side of the header, after the path breadcrumb.
     */
    leftActions?: RepoHeaderAction[]

    /**
     * Actions to display on the right side of the header, before the "Settings" link.
     */
    rightActions?: RepoHeaderAction[]
}

/**
 * The repository header with the breadcrumb, revision switcher, and other actions/links.
 *
 * Other components can contribute actions to the repository header using RepoHeaderActionPortal.
 *
 * This is technically not the "React way" of doing things, but it is more performant (with less
 * visual jitter) and simpler than passing callbacks in props to all components needing to
 * contribute actions. It is also well encapsulated in RepoHeaderActionPortal.
 */
export class RepoHeader extends React.PureComponent<Props, State> {
    private static actionAdds = new Subject<RepoHeaderAction>()
    private static actionRemoves = new Subject<RepoHeaderAction>()
    private static forceUpdates = new Subject<void>()

    private subscriptions = new Subscription()

    public state: State = {}

    /**
     * Add an action link to the repository header. Do not call directly; use RepoHeaderActionPortal
     * instead.
     * @param action to add to the header
     */
    public static addAction(action: RepoHeaderAction): AnonymousSubscription {
        if (action.element.key === undefined || action.element.key === null) {
            throw new Error('RepoHeader addAction: action must have key property')
        }
        RepoHeader.actionAdds.next(action)
        return { unsubscribe: () => RepoHeader.actionRemoves.next(action) }
    }

    /**
     * Forces an update of actions in the repository header. Do not call directly; use
     * RepoHeaderActionPortal instead.
     */
    public static forceUpdate(): void {
        this.forceUpdates.next()
    }

    public componentDidMount(): void {
        this.subscriptions.add(
            RepoHeader.actionAdds.subscribe(action => {
                switch (action.position) {
                    case 'path':
                        this.setState(prevState => ({ pathActions: (prevState.pathActions || []).concat(action) }))
                        break
                    case 'left':
                        this.setState(prevState => ({ leftActions: (prevState.leftActions || []).concat(action) }))
                        break
                    case 'right':
                        this.setState(prevState => ({ rightActions: (prevState.rightActions || []).concat(action) }))
                        break
                }
            })
        )

        this.subscriptions.add(
            RepoHeader.actionRemoves.subscribe(toRemove => {
                switch (toRemove.position) {
                    case 'path':
                        this.setState(prevState => ({
                            pathActions: (prevState.pathActions || []).filter(a => a !== toRemove),
                        }))
                        break
                    case 'left':
                        this.setState(prevState => ({
                            leftActions: (prevState.leftActions || []).filter(a => a !== toRemove),
                        }))
                        break
                    case 'right':
                        this.setState(prevState => ({
                            rightActions: (prevState.rightActions || []).filter(a => a !== toRemove),
                        }))
                        break
                }
            })
        )

        this.subscriptions.add(RepoHeader.forceUpdates.subscribe(() => this.forceUpdate()))
    }

    public componentWillUnmount(): void {
        this.subscriptions.unsubscribe()
    }

    public render(): JSX.Element | null {
        return (
            <div className={`repo-header composite-container__header ${this.props.className || ''}`}>
                <div className="repo-header__path">
                    <RepoBreadcrumb
                        repoPath={this.props.repo.uri}
                        filePath={this.props.filePath}
                        rev={this.props.rev}
                        disableLinks={this.props.disableLinks}
                    />
                    {this.state.pathActions && this.state.pathActions.map(a => a.element)}
                </div>
                {this.state.leftActions && this.state.leftActions.map(a => a.element)}
                <div className="repo-header__spacer" />
                {this.state.rightActions && this.state.rightActions.map(a => a.element)}
                {this.props.repo.viewerCanAdminister && (
                    <NavLink
                        to={`/${this.props.repo.uri}/-/settings`}
                        className="composite-container__header-action"
                        activeClassName="composite-container__header-action-active"
                        title="Repository settings"
                    >
                        <GearIcon className="icon-inline" />
                        <span className="composite-container__header-action-text">Settings</span>
                    </NavLink>
                )}
            </div>
        )
    }
}
