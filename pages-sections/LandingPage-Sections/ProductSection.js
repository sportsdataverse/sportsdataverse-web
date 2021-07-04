import React from "react";
// @material-ui/core components
import { makeStyles } from "@material-ui/core/styles";

// @material-ui/icons
import Chat from "@material-ui/icons/Chat";
import VerifiedUser from "@material-ui/icons/VerifiedUser";
import Fingerprint from "@material-ui/icons/Fingerprint";
// core components
import GridContainer from "../../src/components/Grid/GridContainer.js";
import GridItem from "../../src/components/Grid/GridItem.js";
import InfoArea from "../../src/components/InfoArea/InfoArea.js";

import styles from '../../styles/Shared.module.css'

const useStyles = makeStyles(styles);

export default function ProductSection() {
  const classes = useStyles();
  return (
    <div className={classes.section}>
      <GridContainer justify="center">
        <GridItem xs={12} sm={12} md={8}>
          <h3 className={classes.title}>Talk Data to Us</h3>
          <h4 className={classes.description}>
            We are always looking to add more developers to the SportsDataverse developer group who share common cause
            with the aim to make the sports data industry more diverse and inclusive. If you are already a package developer
            interested in joining us, please reach out below.
          </h4>
        </GridItem>
      </GridContainer>
      <GridContainer justify="center">
        <GridItem xs={12} sm={12} md={8}>
          <h4 className={classes.description}>
            The SportsDataverse is a concept our group has been working on to create and develop a more cohesive set of sports data packages in Python, R and Node.js.
            Among the goals of the SportsDataverse is to flatten the learning curve the average user has to go through to get access to the highest quality open-source data and analytics
          </h4>
        </GridItem>
      </GridContainer>
    </div>
  );
}
