'use client';
import React, { useEffect } from 'react';
import GoalsApp from '@/components/GoalsApp';
import { registerSW } from '@/pwa/registerSW';


export default function Page(){
useEffect(() => { registerSW(); }, []);
return <GoalsApp/>;
}
