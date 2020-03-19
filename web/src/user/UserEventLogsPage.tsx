import React from 'react'
import { RouteComponentProps } from 'react-router'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'
import { Link } from '../../../shared/src/components/Link'
import { dataOrThrowErrors, gql } from '../../../shared/src/graphql/graphql'
import { queryGraphQL } from '../backend/graphql'
import * as GQL from '../../../shared/src/graphql/schema'
import { FilteredConnection } from '../components/FilteredConnection'
import { PageTitle } from '../components/PageTitle'
import { Timestamp } from '../components/time/Timestamp'
import { eventLogger } from '../tracking/eventLogger'
import { UserAreaRouteContext } from './area/UserArea'

interface UserEventNodeProps {
    /**
     * The user to display in this list item.
     */
    node: GQL.IEventLog
}

export const UserEventNode: React.FunctionComponent<UserEventNodeProps> = ({ node }: UserEventNodeProps) => (
    <li className="list-group-item py-2">
        <div className="d-flex align-items-center justify-content-between">
            <div className="user-event-logs-page__event-name">{node.name}</div>
            <div>
                <Timestamp date={node.timestamp} />
            </div>
        </div>
        <div className="user-event-logs-page__url">
            <small>
                From: {node.source}{' '}
                {node.url !== '' ? (
                    <span>
                        (<Link to={node.url}>{node.url}</Link>)
                    </span>
                ) : (
                    ''
                )}
            </small>
        </div>
    </li>
)

class FilteredUserEventLogsConnection extends FilteredConnection<GQL.IEventLog, {}> {}

interface UserEventLogsPageProps extends UserAreaRouteContext, RouteComponentProps {
    isLightTheme: boolean
}

interface UserEventLogsPageState {}

/**
 * A page displaying usage statistics for the site.
 */
export class UserEventLogsPage extends React.PureComponent<UserEventLogsPageProps, UserEventLogsPageState> {
    public componentDidMount(): void {
        eventLogger.logViewEvent('UserEventLogPage')
    }

    public render(): JSX.Element | null {
        return (
            <div className="user-event-logs-page">
                <PageTitle title="User action log" />
                <FilteredUserEventLogsConnection
                    key="chronological"
                    className="list-group list-group-flush user-event-logs-page"
                    hideSearch={true}
                    noun="survey response"
                    pluralNoun="survey responses"
                    queryConnection={this.queryUserEventLogs}
                    nodeComponent={UserEventNode}
                    history={this.props.history}
                    location={this.props.location}
                />
            </div>
        )
    }

    private queryUserEventLogs = (args: { first?: number }): Observable<GQL.IEventLogsConnection> =>
        queryGraphQL(
            gql`
                query UserEventLogs($user: ID!, $first: Int) {
                    node(id: $user) {
                        ... on User {
                            eventLogs(first: $first) {
                                nodes {
                                    name
                                    source
                                    url
                                    timestamp
                                }
                                totalCount
                                pageInfo {
                                    hasNextPage
                                }
                            }
                        }
                    }
                }
            `,
            { ...args, user: this.props.user.id }
        ).pipe(
            map(dataOrThrowErrors),
            map(data => (data.node as GQL.IUser).eventLogs)
        )
}
