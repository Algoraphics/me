import * as React from "react";
import styled from "styled-components";
import { TabLink, Icon } from "./styles";

const InfoIcon = styled(Icon)`
    height: 25px;
    padding-bottom: 3px;
    vertical-align: middle;
`

const DemoText = styled.div`
    padding: 40 0 0 0;
    max-width: 680px;
`

const DemoPage = (props: { isMobile: boolean; onTabChange?: (tab: string) => void }) => {
    return (
        <DemoText>
            This is a little interactive demo of "Bismuth." Hit the control buttons above to play around!
            <br /><br />
            If you don't see anything, your device may not be able to run this visual. For Mac, try using Safari!
            <br/><br/>
            <InfoIcon src="websiteIcons/VisibleWhite.png" />&nbsp;&nbsp; <b>Show/Hide this information panel</b>
            <br />
            <InfoIcon src="websiteIcons/RewindWhite.png" />
            <InfoIcon src="websiteIcons/FastForwardWhite.png" />&nbsp;&nbsp; Rewind / Fast Forward (Try clicking multiple times)
            <br />
            <InfoIcon src="websiteIcons/PauseWhite.png" />&nbsp;&nbsp; Pause (Mouse interaction still works while paused)
            <br />
            <InfoIcon src="websiteIcons/PlayWhite.png" />&nbsp;&nbsp; Resume movement at default speed
            <br />
            <InfoIcon src="websiteIcons/MouseWhite.png" />&nbsp;&nbsp; Toggle mouse interaction (enabled by default)
            <br />
            <InfoIcon src="websiteIcons/PowerUpWhite.png" />&nbsp;&nbsp; Add complexity (the coolest button)
            <br />
            <InfoIcon src="websiteIcons/PowerDownWhite.png" />&nbsp;&nbsp; Reduce complexity (if things get a bit slow)
            <br /><br />
            See {props.onTabChange ? <TabLink onClick={() => props.onTabChange!("Art")}>Art</TabLink> : <b>Art</b>} to learn more about this visual.
        </DemoText>);
}

export class Demo extends React.Component<{ isMobile: boolean; onTabChange?: (tab: string) => void }> {
    componentDidMount() {
        window.scrollTo(0, 0)
    }

    render() {
        return (
            <DemoPage isMobile={this.props.isMobile} onTabChange={this.props.onTabChange} />
        );
    }
}