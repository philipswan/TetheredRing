function CalculateRingParameters() {
    // First we need to convert three city's latitudes and longtitudes into earth-centered-earth-fixed (ECEF) coordinates
    SeattleLat = 

    D21x = P2x-P1x
    D21y = P2y-P1y
    D21z = P2z-P1z
    D31x = P3x-P1x
    D31y = P3y-P1y
    D31z = P3z-P1z

    F2 = 1/2*(D21x^2+D21y^2+D21z^2)
    F3 = 1/2*(D31x^2+D31y^2+D31z^2)

    M23xy = D21x*D31y-D21y*D31x
    M23yz = D21y*D31z-D21z*D31y
    M23xz = D21z*D31x-D21x*D31z

    F23x = F2*D31x-F3*D21x
    F23y = F2*D31y-F3*D21y
    F23z = F2*D31z-F3*D21z

    Cx = P1x+(M23xy*F23y-M23xz*F23z)/(M23xy^2+M23yz^2+M23xz^2)
    Cy = P1y+(M23yz*F23z-M23xy*F23x)/(M23xy^2+M23yz^2+M23xz^2)
    Cz = P1z+(M23xz*F23x-M23yz*F23y)/(M23xy^2+M23yz^2+M23xz^2)

}

function AddStars() {
    const geometry = new THREE.BufferGeometry()
    const vertices = [];

    for ( let i = 0; i < 10000; i ++ ) {

        vertices.push( THREE.MathUtils.randFloatSpread( 2000 ) ); // x
        vertices.push( THREE.MathUtils.randFloatSpread( 2000 ) ); // y
        vertices.push( THREE.MathUtils.randFloatSpread( 2000 ) ); // z

    }

    geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( vertices, 3 ) );

    const particles = new THREE.Points( geometry, new THREE.PointsMaterial( { color: 0x888888 } ) );
    scene.add( particles );
}