export const kmlFileHeader = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Paths</name>
    <description>Tethered Ring</description>
    <Style id="faintGray">
      <LineStyle>
        <color>40323232</color>
        <width>1</width>
      </LineStyle>
      <PolyStyle>
        <color>01000000</color>
      </PolyStyle>
    </Style>
`
export const kmlMainRingPlacemarkHeader = `    <Placemark>
      <name>MainRing</name>
      <description>Main Ring</description>
      <styleUrl>#faintGray</styleUrl>
      <LinearRing>
        <extrude>1</extrude>
        <tessellate>0</tessellate>
        <altitudeMode>absolute</altitudeMode>
        <coordinates>
`

export const kmlTetherPlacemarkHeader = `    <Placemark>
      <name>Tether</name>
      <description>Tether</description>
      <styleUrl>#faintGray</styleUrl>
      <LinearRing>
        <extrude>0</extrude>
        <tessellate>0</tessellate>
        <altitudeMode>absolute</altitudeMode>
        <coordinates>
`
export const kmlLauncherPlacemarkHeader = `    <Placemark>
      <name>Launcher</name>
      <description>Launcher</description>
      <styleUrl>#faintGray</styleUrl>
      <LinearRing>
        <extrude>0</extrude>
        <tessellate>0</tessellate>
        <altitudeMode>absolute</altitudeMode>
        <coordinates>
`

export const kmlRampSupportPlacemarkHeader = `    <Placemark>
      <name>Support</name>
      <description>Support Strut</description>
      <styleUrl>#faintGray</styleUrl>
      <LinearRing>
        <extrude>0</extrude>
        <tessellate>0</tessellate>
        <altitudeMode>absolute</altitudeMode>
        <coordinates>
`



export const kmlPlacemarkFooter = `        </coordinates>
      </LinearRing>
    </Placemark>
`

export const kmlFileFooter = `  </Document>
</kml>
`
