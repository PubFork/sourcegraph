import React from 'react'
import { queryCampaigns } from './backend'
import AddIcon from 'mdi-react/AddIcon'
import { Link } from '../../../../../../shared/src/components/Link'
import { RouteComponentProps } from 'react-router'
import { FilteredConnection, FilteredConnectionFilter } from '../../../../components/FilteredConnection'
import { IUser, CampaignState } from '../../../../../../shared/src/graphql/schema'
import { CampaignNode, CampaignNodeCampaign } from '../../list/CampaignNode'
import { eventLogger } from '../../../../tracking/eventLogger'

interface Props extends Pick<RouteComponentProps, 'history' | 'location'> {
    authenticatedUser: IUser
}

const FILTERS: FilteredConnectionFilter[] = [
    {
        label: 'All',
        id: 'all',
        tooltip: 'Show all campaigns',
        args: {},
    },
    {
        label: 'Open',
        id: 'open',
        tooltip: 'Show only campaigns that are open',
        args: { state: CampaignState.OPEN },
    },
    {
        label: 'Closed',
        id: 'closed',
        tooltip: 'Show only campaigns that are closed',
        args: { state: CampaignState.CLOSED },
    },
]

/**
 * A list of all campaigns on the Sourcegraph instance.
 */
export class GlobalCampaignListPage extends React.PureComponent<Props> {
    public componentDidMount(): void {
        eventLogger.logViewEvent('CampaignsListPage')
    }

    public render(): JSX.Element | null {
        return (
            <>
                <h1>Campaigns</h1>
                <p>Perform and track large-scale code changes</p>

                {this.props.authenticatedUser.siteAdmin && (
                    <div className="text-right mb-1">
                        <Link to="/campaigns/new" className="btn btn-primary">
                            <AddIcon className="icon-inline" /> New campaign
                        </Link>
                    </div>
                )}

                <FilteredConnection<CampaignNodeCampaign>
                    {...this.props}
                    nodeComponent={CampaignNode}
                    queryConnection={queryCampaigns}
                    hideSearch={true}
                    filters={FILTERS}
                    noun="campaign"
                    pluralNoun="campaigns"
                />
            </>
        )
    }
}
