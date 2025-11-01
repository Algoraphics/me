import * as React from "react";
import styled from "styled-components";
import { TabLink, RoundedImage, CenteredImage, TextSection } from "./styles";

const DeskFace = styled(RoundedImage)`
    float: left;
    margin-right: 10px;
`
const MobileTextSection = styled.div`
    flex-direction: column;
    justify-content: center;
    flex-wrap: wrap;
    flex: 1 1 auto;
`

const MobileWrap = styled.div`
`

const TopLevel = styled.div`
    padding: 0 0 30 0;
`

var IntroText = (props: { onTabChange: (tab: string) => void }) => (
    <TextSection>
        Hi!
        <br /><br />
                My name is Ethan Rabb. I'm a Software Engineer with 10+ years in industry and a passion for creative programming projects.
        <h2>What kind of work do you do?</h2>
                        I've done primarily Back-end, but also Front-end and DevOps work in AdTech, Aviation, and Robotics.
                        I love novelty, and I'm always looking for new fields and technologies where I can use my programming skills.
        <br /><br />
                        Currently I'm most interested in Full Stack development, but open to any opportunity that catches my eye. I'm excited by innovation and anything helping make the world a better place to live in.
        <br /><br />
                        For a full Resume and more detail about my work, see <TabLink onClick={() => props.onTabChange("Work")}>Work</TabLink>.
    </TextSection>
);

var AboutIntroDesktop = (props: { onTabChange: (tab: string) => void }) => (
    <TextSection>
        <DeskFace src="Headshot.jpg" title="It me" height="320"></DeskFace>
        <IntroText onTabChange={props.onTabChange}/>
    </TextSection>
);

var AboutIntroMobile = (props: { onTabChange: (tab: string) => void }) => (
    <MobileTextSection>
        <MobileWrap>
            <CenteredImage src="Headshot.jpg" title="It me" height="270"></CenteredImage>
        </MobileWrap>
        <IntroText onTabChange={props.onTabChange}/>
    </MobileTextSection>
);

var Additional = (props: { onTabChange: (tab: string) => void }) => (
    <TextSection>
        <h2>What's going on with the background?</h2>
                In my free time, I like to explore the limits of code as an art form. The background to this website is one of my creations!
                You can play around with it at <b>Demo</b>, or find more examples and info at <b>Art</b>.
        <br /><br />
                I'm interested in ideas like procedural generation, immersion, artificial intelligence, and emergent interaction, and how these concepts engage a viewer.
        <h2>Do you have any other interests?</h2>
                Definitely! I have plenty of non-programming hobbies and interests.
        <br /><br /><b>Things I do outside:</b> Climbing, Hiking, Frisbee Golf, Kayaking, Camping, Swimming, Biking, Tennis, Pickleball
        <br /><br /><b>Topics I could talk about for hours:</b> Nature, Movies/TV, Local Restaurants & Bars, Writing, Basketball, Meteorology, Investing, Gaming, Cooking, Robotics, Space
        <h2>What's the best way to reach you?</h2>
                The best way to reach me is at <b>ethanrabb@gmail.com.</b>
        <br /><br />
                Let's chat!
    </TextSection>
);

const AboutMe = (props: { isMobile: boolean; onTabChange: (tab: string) => void }) => {
    let { isMobile, onTabChange } = props;
    return (
        <TopLevel>
            {isMobile ? <AboutIntroMobile onTabChange={onTabChange} /> : <AboutIntroDesktop onTabChange={onTabChange}/>}
            <Additional onTabChange={onTabChange}/>
        </TopLevel>
    );
}

export default AboutMe;
