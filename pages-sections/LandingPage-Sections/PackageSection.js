import React from "react";
// nodejs library that concatenates classes
import classNames from "classnames";
// @material-ui/core components
import { makeStyles } from "@material-ui/core/styles";

// @material-ui/icons

// core components
import GridContainer from "../../src/components/Grid/GridContainer.js";
import GridItem from "../../src/components/Grid/GridItem.js";
import Button from "../../src/components/CustomButtons/Button.js";
import Card from "../../src/components/Card/Card.js";
import CardBody from "../../src/components/Card/CardBody.js";
import CardFooter from "../../src/components/Card/CardFooter.js";

import styles from "../../assets/jss/nextjs-material-kit/pages/landingPageSections/packageStyle.js";


const useStyles = makeStyles(styles);

export default function PackageSection() {
  const classes = useStyles();
  const imageClasses = classNames(
    classes.imgRaised,
    classes.imgRoundedCircle,
    classes.imgFluid
  );
  return (
    <div className={classes.section}>
      <h2 className={classes.title}>R packages that are part of the SportsDataverse:</h2>
      <div>
        <GridContainer>
          <GridItem xs={12} sm={12} md={4}>
            <Card plain>
              <GridItem xs={12} sm={12} md={6} className={classes.itemGrid}>
                <img src={`images/cfbscrapR-logo.png`} alt="cfbscrapR" />
              </GridItem>
              <h4 className={classes.cardTitle}>
                cfbscrapR
                <br />
                <small className={classes.smallTitle}>College Football - R</small>
              </h4>
              <CardBody>
                <p className={classes.description}>
                cfbscrapR is an R package for working with College Football data.
                </p>
                <p className={classes.description}>
                It is an R API wrapper around https://collegefootballdata.com/.
                </p>
                <p className={classes.description}>
                It provides users the capability to retrieve data from the API and supplement that data with
                Expected Points Added/Win Probability added metrics.
                </p>
              </CardBody>
            </Card>
          </GridItem>
          <GridItem xs={12} sm={12} md={4}>
            <Card plain>
              <GridItem xs={12} sm={12} md={6} className={classes.itemGrid}>
                <img src={`images/kenpomR-logo.png`} alt="kenpomR" />
              </GridItem>
              <h4 className={classes.cardTitle}>
                kenpomR
                <br />
                <small className={classes.smallTitle}>Men's College Basketball - R</small>
              </h4>
              <CardBody>
                <p className={classes.description}>
                kenpomR is an R package for working with men's college basketball data.
                A scraping and aggregating interface for Ken Pomeroy’s college basketball statistics website, kenpom.com.
                </p>
                <p className={classes.description}>
                Also provides support for ESPN’s men's college basketball game data and NCAA NET Rankings.
                </p>
              </CardBody>
            </Card>
          </GridItem>
          <GridItem xs={12} sm={12} md={4}>
            <Card plain>
              <GridItem xs={12} sm={12} md={6} className={classes.itemGrid}>
                <img src={`images/wehoop-logo.png`} alt="wehoop"  />
              </GridItem>
              <h4 className={classes.cardTitle}>
                wehoop
                <br />
                <small className={classes.smallTitle}>WNBA and Women's College Basketball - R</small>
              </h4>
              <CardBody>
                <p className={classes.description}>
                wehoop is an R package for working with WNBA and women's college basketball data.
                </p>
                <p className={classes.description}>
                Provides support for ESPN’s WNBA and women's college basketball game data and NCAA NET Rankings.
                </p>
              </CardBody>
            </Card>
          </GridItem>
        </GridContainer>
      </div>
      {/* second row of packages */}
      <div>
        <GridContainer>
          <GridItem xs={12} sm={12} md={4}>
            <Card plain>
              <GridItem xs={12} sm={12} md={7} className={classes.itemGrid}>
                <img src={`images/cfbrecruitR-logo.png`} alt="cfbrecruitR"  />
              </GridItem>
              <h4 className={classes.cardTitle}>
                cfbrecruitR
                <br />
                <small className={classes.smallTitle}>College Football Recruiting - R</small>
              </h4>
              <CardBody>
                <p className={classes.description}>
                cfbrecruitR is an R package for working with college football recruiting data.
                </p>
              </CardBody>
            </Card>
          </GridItem>
          <GridItem xs={12} sm={12} md={4}>
            <Card plain>
              <GridItem xs={12} sm={12} md={7} className={classes.itemGrid}>
                <img src={`images/cfbscrapR-data-repo.png`} alt="cfbscrapR-data" />
              </GridItem>
              <h4 className={classes.cardTitle}>
                cfbscrapR-data
                <br />
                <small className={classes.smallTitle}>College Football - Data</small>
              </h4>
              <CardBody>
                <p className={classes.description}>
                cfbscrapR-data is a repository for working with CFB data. 2014-2020 data included in csv, rds, and parquet format.
                </p>
              </CardBody>
            </Card>
          </GridItem>
          <GridItem xs={12} sm={12} md={4}>
            <Card plain>
              <GridItem xs={12} sm={12} md={7} className={classes.itemGrid}>
                <img src={`images/kenpomR-data-repo.png`} alt="kenpomR-data" />
              </GridItem>
              <h4 className={classes.cardTitle}>
                kenpomR-data
                <br />
                <small className={classes.smallTitle}>Men's College Basketball - R</small>
              </h4>
              <CardBody>
                <p className={classes.description}>
                kenpomR contains data for most teams, players and coaches from 2002-2020. All data provided in csv format.
                </p>
              </CardBody>
            </Card>
          </GridItem>
        </GridContainer>
      </div>
    </div>
  );
}
