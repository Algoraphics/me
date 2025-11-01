import styled from "styled-components";

export const TabLink = styled.span`
    font-weight: bold;
    color: yellow;
    cursor: pointer;
    text-decoration: underline;
    &:hover {
        color: goldenrod;
    }
`;

export const ExternalLink = styled.a`
    text-decoration: none;
    &:visited {
        color: goldenrod;
    }
    &:link {
        color: yellow;
    }
    &:hover {
        font-weight: bold;
    }
`;

export const Section = styled.div`
    display: block;
    flex-justify: center;
    flex-direction: column;
`;

export const TextSection = styled.div`
    padding: 5 5 0 5;
`;

export const FlexSection = styled.div`
    display: flex;
    flex-justify: center;
    padding: 10px;
`;

export const RoundedImage = styled.img`
    padding: 10px;
    border-radius: 20%;
`;

export const CenteredImage = styled(RoundedImage)`
    margin: 0 auto;
    display: block;
`;

export const Icon = styled.img`
    padding: 5px;
`;

export const FullWindow = styled.div`
  padding: 0 0 250 0;
  position: relative;
  z-index: 1;
`;

export const Window = styled.div<{ fontSize: string; radius: string; demoActive: boolean }>`
  background-color: #212121;
  color: white;
  font-size: ${(props) => props.fontSize};
  padding: 40 25;
  max-width: 75%;
  margin: auto;
  border-radius: ${(props) => props.radius};
  transition: 1s ease;
  transition-property: opacity;
  transform-origin: top;
  ${(props) => props.demoActive && `    
    opacity: 0 !important;
  `};
`;

export const TabPage = styled.div<{ maxWidth: string }>`
  max-width: ${(props) => props.maxWidth};
  min-height: 100vh;
`;

export const Tab = styled.button<{ padding: string; border: string; activeTab: boolean }>`
  padding: ${(props) => props.padding};
  font-size: 15px;
  font-weight: bold;
  cursor: pointer;
  border-width: thin;
  border-style: ${(props) => props.border};
  outline: 0;
  background-color: ${(props) => props.activeTab ? 'yellow' : '#575757'};
  color: ${(props) => props.activeTab ? 'black' : 'white'};
  white-space: nowrap;
  border-bottom: ${(props) => props.activeTab ? '0' : '2px solid'};
  border-color: #575757;
  border: ${(props) => props.activeTab ? '0' : undefined};
  &:hover {
    border-color: yellow;
  }
`;

export const TabButtons = styled.div`
    display: flex;
    justify-content: center;
`;

export const FixedButtons = styled.div`
    z-index: 5;
    position: fixed;
`;

