import React from 'react';
// nodejs library that concatenates classes
import classNames from 'classnames'
import Link from 'next/link'
// @material-ui/core components
import { makeStyles } from '@material-ui/core/styles';

// @material-ui/icons

// core components
import GridContainer from '../../src/components/Grid/GridContainer.js';
import GridItem from '../../src/components/Grid/GridItem.js';
import Button from '../../src/components/CustomButtons/Button.js';
import Card from '../../src/components/Card/Card.js';
import CardBody from '../../src/components/Card/CardBody.js';
import CardFooter from '../../src/components/Card/CardFooter.js';
import Image from 'next/image'

import styles from '../../assets/jss/nextjs-material-kit/pages/landingPageSections/packageStyle.js';


const useStyles = makeStyles(styles);

export default function DataPackageSection() {
  const classes = useStyles();
  const imageClasses = classNames(
    classes.imgRaised,
    classes.imgRoundedCircle,
    classes.imgFluid
  );
  return (
    <div className={classes.section}>
      <h2 className={classes.title}>Data Repositories that support the SportsDataverse packages:</h2>
      <div>
        <GridContainer>
          <GridItem xs={12} sm={12} md={4}>
            <Card plain>
              <GridItem xs={12} sm={12} md={11} className={classes.itemGrid}>
              <Link href='https://github.com/saiemgilani/cfbfastR-data/'>
                <Image
                  src={`/images/cfbfastR-data-repo.png`}
                  alt='cfbfastR-data'
                  width={299}
                  height={250} />
              </Link>
              </GridItem>
              <h4 className={classes.cardTitle}>
              <Link href='https://github.com/saiemgilani/cfbfastR-data/'>cfbfastR-data</Link>
                <br />
                <small className={classes.smallTitle}>College Football - Data</small>
              </h4>
              <CardBody>
                <p className={classes.description}>
                <Link href='https://github.com/saiemgilani/cfbfastR-data/'>cfbfastR-data</Link> is a repository for working with CFB data. 2002-2020 data included in csv, rds, and parquet format.
                </p>
              </CardBody>
            </Card>
          </GridItem>
          <GridItem xs={12} sm={12} md={4}>
            <Card plain>
              <GridItem xs={12} sm={12} md={9} className={classes.itemGrid}>
              <Link href='https://github.com/saiemgilani/hoopR-data/'>
                <Image
                  src={`/images/hoopR_social_card_data_repo.png`}
                  alt='hoopR-data'
                  width={600}
                  height={600} />
              </Link>
              </GridItem>
              <h4 className={classes.cardTitle}>
              <Link href='https://github.com/saiemgilani/hoopR-data/'>hoopR-data</Link>
                <br />
                <small className={classes.smallTitle}>Men's Basketball - Data</small>
              </h4>
              <CardBody>
                <p className={classes.description}>
                <Link href='https://github.com/saiemgilani/hoopR-data/'>hoopR-data</Link> contains data for most teams, players and coaches from 2002-2020. All data provided in csv, rds, and parquet format.
                </p>
              </CardBody>
            </Card>
          </GridItem>
          <GridItem xs={12} sm={12} md={4}>
            <Card plain>
              <GridItem xs={12} sm={12} md={7} className={classes.itemGrid}>
              <Link href='https://github.com/saiemgilani/wehoop-data/'>
              <Image
                  src={`/images/wehoop_social_card_data_repo.png`}
                  alt='wehoop-data'
                  width={620}
                  height={770} />
              </Link>
              </GridItem>
              <h4 className={classes.cardTitle}>
              <Link href='https://github.com/saiemgilani/wehoop-data/'>wehoop-data</Link>
                <br />
                <small className={classes.smallTitle}>Women's Basketball - Data</small>
              </h4>
              <CardBody>
                <p className={classes.description}>
                <Link href='https://github.com/saiemgilani/wehoop-data/'>wehoop-data</Link> contains data for most teams and games from 2002-present. All data provided in csv, rds, and parquet format.
                </p>
              </CardBody>
            </Card>
          </GridItem>
        </GridContainer>
      </div>
    </div>
  );
}
