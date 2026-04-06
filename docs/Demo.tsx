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
            This is a little interactive demo of {props.onTabChange ? <TabLink onClick={() => props.onTabChange!("Art")}>Bismuth</TabLink> : <b>Bismuth</b>}. Hit the control buttons above to play around!
            <br /><br />
            <InfoIcon src="websiteIcons/VisibleWhite.png" />&nbsp;&nbsp; Show/Hide this information panel (H)
            <br />
            <InfoIcon src="websiteIcons/RewindWhite.png" />
            <InfoIcon src="websiteIcons/FastForwardWhite.png" />&nbsp;&nbsp; Speed (Try clicking multiple times)
            <br />
            <InfoIcon src="websiteIcons/PauseWhite.png" />&nbsp;&nbsp; Pause (Mouse interaction still works while paused)
            <br />
            <InfoIcon src="websiteIcons/PlayWhite.png" />&nbsp;&nbsp; Reset (to default speed)
            <br />
            <InfoIcon src="websiteIcons/MouseWhite.png" />&nbsp;&nbsp; Toggle mouse interaction (enabled by default)
            <br />
            <InfoIcon src="websiteIcons/PowerUpWhite.png" />&nbsp;&nbsp; Add complexity (the coolest button)
            <br />
            <InfoIcon src="websiteIcons/PowerDownWhite.png" />&nbsp;&nbsp; Reduce complexity (if things get a bit slow)
            <br />
            <InfoIcon src="websiteIcons/random.png" />&nbsp;&nbsp; I'm feeling lucky (⊂(◉‿◉)つ)
            <br />
            <InfoIcon src="websiteIcons/fullscreen.png" />&nbsp;&nbsp; Fullscreen mode (H to unhide UI)
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