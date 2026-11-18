// Reviewed NASA Image and Video Library items for satellites in the default
// groups. Each was checked by eye for subject and labeled as a photograph or an
// illustration. "family" images show the same type of spacecraft, not
// necessarily this exact one, and say so in their caption.
const asset=id=>'https://images-assets.nasa.gov/image/'+id+'/'+id+'~small.jpg',details=id=>'https://images.nasa.gov/details/'+id;
const image=(id,fields)=>({src:asset(id),source:details(id),...fields});
const ISS=image('iss066e080166',{title:'The International Space Station',type:'Photograph',credit:'NASA / ESA – Thomas Pesquet',date:'November 8, 2021',caption:'Photographed from the SpaceX Crew Dragon Endeavour during a fly-around after undocking.'});
const HUBBLE=image('S109E5707',{title:'Hubble after its 2002 servicing',type:'Photograph',credit:'NASA',date:'March 9, 2002',caption:'Hubble drifts away from Space Shuttle Columbia over Earth’s horizon after the STS-109 repairs.'});
const CHANDRA=image('9906646',{title:'Chandra just after release',type:'Photograph',credit:'NASA',date:'July 1999',caption:'An STS-93 crew member photographed Chandra, still attached to its upper stage, soon after release from Columbia.'});
const SOYUZ_MS29=image('iss074e0814091',{title:'Soyuz MS-29 arriving at the station',type:'Photograph',credit:'NASA',date:'June 14, 2026',caption:'Soyuz MS-29 approaches the International Space Station for an automated docking.'});
const DRAGON=image('iss073e0505071',{title:'A SpaceX Dragon approaching the station',type:'Photograph',family:true,credit:'NASA',date:'August 2, 2025',caption:'The Dragon carrying NASA’s Crew-11 approaches the ISS. Same type of spacecraft, not necessarily this vehicle.'});
const PROGRESS=image('iss073e0284397',{title:'A Progress cargo ship approaching the station',type:'Photograph',family:true,credit:'NASA',date:'July 5, 2025',caption:'Progress 92 approaches the ISS. Same type of spacecraft, not necessarily this vehicle.'});
const GOES_R=image('KSC-20160823-PH_SWW01_0079',{title:'GOES-R before launch',type:'Photograph',credit:'NASA / Bill White',date:'August 23, 2016',caption:'GOES-R, which became GOES-16, stands upright in a Florida processing facility.'});
const GOES_S=image('KSC-20171205-PH_MAS01_0031',{title:'GOES-S before launch',type:'Photograph',credit:'NOAA / NASA – Michael Starobin',date:'December 5, 2017',caption:'Engineers inspect GOES-S, which became GOES-17, after unpacking it in Florida.'});
const GOES_FAMILY={...GOES_R,family:true,caption:'GOES-R (now GOES-16), the first of the same four-satellite series. Same type of spacecraft, not this exact one.'};
const TDRS_E=image('S90-41340',{title:'TDRS-E in orbit (illustration)',type:'Artist’s illustration',credit:'NASA',date:'June 1990',caption:'Artist’s concept of TDRS-E, which became TDRS-5, relaying data in geosynchronous orbit.'});
const TDRS_FAMILY={...TDRS_E,family:true,caption:'Artist’s concept of TDRS-E (TDRS-5), a first-generation relay satellite of the same design. Not this exact one.'};
const SDO=image('PIA18169',{title:'Solar Dynamics Observatory (illustration)',type:'Artist’s illustration',credit:'NASA / GSFC',date:'2010',caption:'Artist’s concept of SDO above Earth, facing the Sun.'});
const NUSTAR=image('PIA15265',{title:'NuSTAR (illustration)',type:'Artist’s illustration',credit:'NASA / JPL-Caltech',date:'2012',caption:'Artist’s concept showing NuSTAR’s 10-metre mast separating its optics from its detectors.'});
const FERMI=image('KSC-08pd1359',{title:'GLAST (Fermi) before launch',type:'Photograph',credit:'NASA',date:'May 14, 2008',caption:'Technicians lower the Gamma-ray Large Area Space Telescope, later renamed Fermi, in Florida.'});
const MMS=image('KSC-2015-1065',{title:'The MMS spacecraft stack',type:'Photograph',credit:'NASA',date:'January 12, 2015',caption:'The four Magnetospheric Multiscale spacecraft, stacked for launch, during solar-array testing in Florida.'});

export const satelliteImages={
 25544:[ISS],49044:[ISS],20580:[HUBBLE],25867:[CHANDRA],100057:[SOYUZ_MS29],
 100882:[DRAGON],101031:[DRAGON],68837:[PROGRESS],100712:[PROGRESS],
 41866:[GOES_R],43226:[GOES_S],51850:[GOES_FAMILY],60133:[GOES_FAMILY],
 21639:[TDRS_E],19548:[TDRS_FAMILY],22314:[TDRS_FAMILY],23613:[TDRS_FAMILY],
 36395:[SDO],38358:[NUSTAR],33053:[FERMI],40482:[MMS],40483:[MMS],40484:[MMS],40485:[MMS]
};
export function satelliteImagesFor(norad){return satelliteImages[norad]??[];}
