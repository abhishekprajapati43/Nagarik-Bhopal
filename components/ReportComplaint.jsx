import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { addComplaint } from "../utils/storage";

const emptyForm = {
  wasteType: "",
  description: "",
  address: "",
  image: "",
  latitude: "",
  longitude: "",
};

export default function ReportComplaint() {
  const [formData, setFormData] = useState(emptyForm);
  const navigate = useNavigate();

  const update = (field, value) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const getLocation = () => {
    if (!navigator.geolocation) {
      window.alert("Geolocation is not supported.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFormData((current) => ({
          ...current,
          latitude: position.coords.latitude.toFixed(5),
          longitude: position.coords.longitude.toFixed(5),
        }));
      },
      () => {
        window.alert("Unable to fetch location.");
      }
    );
  };

  const handleImage = (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      update("image", "");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      window.alert("Please choose an image smaller than 2 MB.");
      event.target.value = "";
      update("image", "");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => update("image", String(reader.result));
    reader.readAsDataURL(file);
  };

  const submitComplaint = (event) => {
    event.preventDefault();

    const created = addComplaint({
      wasteType: formData.wasteType,
      description: formData.description,
      address: formData.address,
      image: formData.image,
      position:
        formData.latitude && formData.longitude
          ? [Number(formData.latitude), Number(formData.longitude)]
          : null,
    });

    setFormData(emptyForm);
    navigate(`/complaint/${created.id}`);
  };

  return (
    <div className="container">
      <h1>Report Garbage</h1>

      <form onSubmit={submitComplaint}>
        <label>Waste Type</label>
        <select
          required
          value={formData.wasteType}
          onChange={(event) => update("wasteType", event.target.value)}
        >
          <option value="">Select Waste</option>
          <option>Plastic</option>
          <option>Mixed Waste</option>
          <option>Wet Waste</option>
          <option>Dry Waste</option>
          <option>Construction Waste</option>
          <option>Dead Animal</option>
        </select>

        <label>Address / Landmark</label>
        <input
          required
          placeholder="e.g. MP Nagar Zone-1, near the bus stop"
          value={formData.address}
          onChange={(event) => update("address", event.target.value)}
        />

        <label>Description</label>
        <textarea
          required
          rows="5"
          placeholder="Describe the problem..."
          value={formData.description}
          onChange={(event) => update("description", event.target.value)}
        />

        <label>Upload Image</label>
        <input type="file" accept="image/*" onChange={handleImage} />

        <button type="button" onClick={getLocation}>Get Current Location</button>

        <div className="location-fields">
          <input readOnly placeholder="Latitude" value={formData.latitude} />
          <input readOnly placeholder="Longitude" value={formData.longitude} />
        </div>

        <button type="submit">Submit Complaint</button>
      </form>
    </div>
  );
}
