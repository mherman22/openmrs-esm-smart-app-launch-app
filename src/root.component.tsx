import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import SelectPatient from './select-patient.component';

const Root: React.FC = () => (
  <BrowserRouter basename={window.getOpenmrsSpaBase()}>
    <Routes>
      <Route path="smart/select-patient" element={<SelectPatient />} />
    </Routes>
  </BrowserRouter>
);

export default Root;
