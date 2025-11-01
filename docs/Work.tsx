import * as React from "react";
import styled from "styled-components";
import { FlexSection } from "./styles";

const ResumeFrame = styled.iframe`
    display: block;
    border: none;
    height: 80vh;
    width: 100%;
`

const Work = (props: { isMobile: boolean }) => {
    return (
        <>
            I've worked at several companies over my career, almost all from different industries.
            <h2>OnsiteIQ</h2>
                In 2023, anticipating a move to live in the Bay Area, I switched to a remote position at OnsiteIQ.
                I led full-stack development on mission-critical features serving millions of progress records across 1000+ construction projects.
                My focus was on performance optimization, implementing new architecture, and helping establish Agile processes for the team.
            <h2>Maize Analytics (SecureLink (Imprivata))</h2>
                During Covid, I switched to remote work at Maize Analytics (acquired by SecureLink in 2021 (acquired by Imprivata in 2022)).
                I led full-stack development on a healthcare data privacy auditing platform serving 50+ hospitals across the US, ingesting millions of records daily.
                My work focused on database optimization, cross-team collaboration, mentoring junior developers, and leading a full-scale frontend modernization.
            <h2>ForeFlight (Boeing)</h2>
                In 2018, after I moved to Austin, I began working at ForeFlight (acquired by Boeing in 2019).
                I managed a variety of Spring microservices for the server team, focusing mostly on weather data and alerting.
                I also helped build and improve features for the Logbook web interface and created internal tools to help other teams manage data.
            <h2>Quantcast</h2>
                After graduating college, I moved to San Francisco to work at Quantcast. I worked on the Real-Time / Edge Services team.
                We owned the core back-end systems serving real-time ads to millions of users per day. My responsibilities focused on
                feature addition, testing, and cloud migration for always-on services with expectations of very high throughput and low response latency.
            <h2>Resume</h2>
            <FlexSection>
                <ResumeFrame height="100%" src="https://docs.google.com/document/d/18cHgo3azL7ami40AvUrWzBn7NL66k5ch1A1XrCKUi3s/preview" />
            </FlexSection>
        </>
    );
}

export default Work;