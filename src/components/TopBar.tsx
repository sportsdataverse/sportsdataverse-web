import React, { ReactElement, useContext } from 'react'
import Toolbar from '@material-ui/core/Toolbar'
import SunIcon from '@material-ui/icons/WbSunnyOutlined'
import ViewHeadlineIcon from '@material-ui/icons/ViewHeadline'
import MoonIcon from '@material-ui/icons/Brightness2Outlined'
import CustomDropdown from '../components/CustomDropdown/CustomDropdown';
import CodeIcon from '@material-ui/icons/Code'
import AccountTreeIcon from '@material-ui/icons/AccountTree';
import IconButton from '@material-ui/core/IconButton';
import Typography from '@material-ui/core/Typography'
import Button from '@material-ui/core/Button'
import AppBar from '@material-ui/core/AppBar'
import useScrollTrigger from '@material-ui/core/useScrollTrigger'
import { makeStyles } from '@material-ui/core/styles'
import { ToggleThemeContext } from '../theme'
import Link from 'next/link'
import { Tooltip } from '@material-ui/core'
import { NAME_AND_DOMAIN } from '../types/constants'
import Image from 'next/image'
import {
  container,
  hexToRGBAlpha,
  defaultFont,
  primaryColor,
  infoColor,
  successColor,
  warningColor,
  dangerColor,
  roseColor,
  transition,
  boxShadow,
  drawerWidth
} from '../../assets/jss/nextjs-material-kit.js';
const useStyles = makeStyles({
  appBar: {
    display: 'flex',
    border: '0',
    borderRadius: '3px',
    padding: '0.625rem 0',
    marginBottom: '20px',
    color: '#7B1729',
    width: '100%',
    backgroundColor: '#7B1729',
    boxShadow:
      '0 4px 18px 0px rgba(0, 0, 0, 0.12), 0 7px 10px -5px rgba(0, 0, 0, 0.15)',
    transition: 'all 150ms ease 0s',
    alignItems: 'center',
    flexFlow: 'row nowrap',
    justifyContent: 'flex-start',
    position: 'relative',
    zIndex: 'unset'
  },
  absolute: {
    position: 'absolute'
  },
  fixed: {
    position: 'fixed'
  },
  show: {
    transform: 'translateY(0)',
    transition: 'transform .5s',
  },
  hide: {
    transform: 'translateY(-110%)',
    transition: 'transform .5s',
  },
  toolbar: {
    paddingLeft: '5%',
  },
  toolbarContent: {
    paddingLeft: 30,
  },
  toolbarRight: {
    right: 0,
    position: 'absolute',
    paddingRight: '5%',
  },
  container: {
    ...container,
    minHeight: '50px',
    flex: '1',
    alignItems: 'center',
    justifyContent: 'space-between',
    display: 'flex',
    flexWrap: 'nowrap'
  },
})

export const TopBar = (): ReactElement => {
  const trigger = useScrollTrigger()
  const classes = useStyles()
  const { toggleTheme, isDark } = useContext(ToggleThemeContext)

  return (
    <AppBar className={trigger ? classes.hide : classes.show} position='sticky'>
      <Toolbar className={classes.toolbar}>
        <Link href='https://sportsdataverse.org/'>
            <Image
              src='/logo/logo.png'
              width='80px'
              height='40px'
              alt='sportsdataverse.org'
            />
        </Link>
        <div className={classes.toolbarContent}>
        <CustomDropdown
            noLiPadding
            navDropdown
            buttonText="Packages"
            buttonProps={{
              color: "transparent"
            }}
            buttonIcon={AccountTreeIcon}
            dropdownList={[
              <a className={classes.toolbarContent}><strong>Python</strong></a>,
              <Link href="https://cfbfastR-py.sportsdataverse.org/">
                <a href="https://cfbfastR-py.sportsdataverse.org/"
                className={classes.toolbarContent}>
                  cfbfastR-py</a>
              </Link>,
              <Link href="https://hoopR-py.sportsdataverse.org/">
                <a href="https://hoopR-py.sportsdataverse.org/"
                 className={classes.toolbarContent}>hoopR-py</a>
              </Link>,
              <Link href="https://wehoop-py.sportsdataverse.org/">
                <a href="https://wehoop-py.sportsdataverse.org/"
                 className={classes.toolbarContent}>wehoop-py</a>
              </Link>,
              <strong>R</strong>,
              <Link href="https://saiemgilani.github.io/cfbfastR/">
                <a href="https://saiemgilani.github.io/cfbfastR/"
                 className={classes.toolbarContent}>cfbfastR</a>
              </Link>,
              <Link href="https://saiemgilani.github.io/hoopR/">
                <a href="https://saiemgilani.github.io/hoopR/"
                 className={classes.toolbarContent}>hoopR</a>
              </Link>,
              <Link href="https://saiemgilani.github.io/wehoop/">
                <a href="https://saiemgilani.github.io/wehoop/">wehoop</a>
              </Link>,
              <Link href="https://saiemgilani.github.io/recruitR/">
                <a href="https://saiemgilani.github.io/recruitR/"
                 className={classes.toolbarContent}>recruitR</a>
              </Link>,
              <Link href="https://puntalytics.github.io/puntr/">
                <a href="https://puntalytics.github.io/puntr/"
                 className={classes.toolbarContent}>puntr</a>
              </Link>,
              <Link href="https://jacklich10.github.io/gamezoneR/">
                <a
                  href="https://jacklich10.github.io/gamezoneR/"
                  target="_blank"
                  rel="noreferrer"
                  className={classes.toolbarContent}
                > gamezoneR
                </a>
              </Link>,
              <a className={classes.toolbarContent}><strong>Node.js</strong></a>,
              <Link href="https://saiemgilani.github.io/sportsdataverse">
                <a
                  href="https://saiemgilani.github.io/sportsdataverse"
                > sportsdataverse.js
                </a>
              </Link>
            ]}
          />
        </div>
        <div className={classes.toolbarContent}>
          <Link href='/blog'>
            <Button variant='text' color='inherit'>
              <ViewHeadlineIcon />
              &nbsp;Blog
            </Button>
          </Link>
        </div>
        <div className={classes.toolbarRight}>
          <Tooltip title='Toggle Theme'>
            <Button variant='text' color='inherit' onClick={toggleTheme}>
              {isDark ? <SunIcon /> : <MoonIcon />}
            </Button>
          </Tooltip>
        </div>
      </Toolbar>
    </AppBar>
  )
}

export default TopBar
