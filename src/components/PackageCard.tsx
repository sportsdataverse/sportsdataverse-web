import React, { FC, ReactElement } from 'react'
import { makeStyles } from '@material-ui/styles'
import Card from '@material-ui/core/Card'
import CardActionArea from '@material-ui/core/CardActionArea'
import CardActions from '@material-ui/core/CardActions'
import CardContent from '@material-ui/core/CardContent'
import CardMedia from '@material-ui/core/CardMedia'
import Button from '@material-ui/core/Button'
import ChevronRight from '@material-ui/icons/ChevronRight'
import Box from '@material-ui/core/Box'
import Container from '@material-ui/core/Container';
import useMediaQuery from '@material-ui/core/useMediaQuery'
import Typography from '@material-ui/core/Typography';

import Image from 'next/image'
import GitHubIcon from '@material-ui/icons/GitHub'
import AccountTreeIcon from '@material-ui/icons/AccountTree'

import Link from 'next/link'

type PackageCardProps = {
    sourceHref: string,
    sourceLabel: string,
    logo?: StaticImageData,
    docsHref: string,
    sports: string,
    repositoryType: string,
    description: any[]
  }


// const useStyles = makeStyles((theme) => ({
//   container: {
//     minWidth: '95%',
//     width: '100%',
//     height: 400,
//     spacing: '2%',
//     position: 'relative',
//     backgroundColor: theme.palette.primary.main,
//     color: theme.palette.text.secondary,
//   },
// }))

export const PackageCard: FC<PackageCardProps> = ({ 
    sourceHref,
    sourceLabel,
    logo,
    docsHref,
    sports,
    repositoryType,
    description }): ReactElement => {
//   const classes = useStyles()
  const large = useMediaQuery('(min-width:500px)')
  return (
      
    <Container maxWidth="sm"  >
        <Box p={1}>
            <Link href={sourceHref}>
                {logo !== ''?<Image
                    src={logo}
                    alt={sourceLabel} />:''}
            </Link>
            
            <Typography variant={'h4'}><Link href={sourceHref}>{`${sourceLabel}`}</Link>  <Link href={sourceHref}><GitHubIcon/></Link></Typography>
            <Typography variant={'caption'}>{`${sports}`+' - '+`${repositoryType}`}</Typography>
            {description.map((d,idx)=>
            
                <Box p={1} key={idx}>
                    <Typography variant={'body1'} style={{
                        textAlign: 'left'
                    }}>{d.content}</Typography>
                </Box>
            )}
        </Box>
    </Container>
  )
}

export default PackageCard
