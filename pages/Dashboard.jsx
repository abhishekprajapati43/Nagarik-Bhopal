import StatsCard from "../components/StatsCard";

export default function Dashboard() {

  return (

    <div className="container">

      <h1>Dashboard</h1>

      <div
        style={{
          display:"flex",
          gap:"20px",
          flexWrap:"wrap",
          marginTop:"30px"
        }}
      >

        <StatsCard
          title="Total Complaints"
          value="1250"
          color="#2563eb"
        />

        <StatsCard
          title="Pending"
          value="320"
          color="#f59e0b"
        />

        <StatsCard
          title="Resolved"
          value="860"
          color="#16a34a"
        />

        <StatsCard
          title="In Progress"
          value="70"
          color="#dc2626"
        />

      </div>

      <br />
      <br />

      <h2>Recent Complaints</h2>

      <table
        style={{
          width:"100%",
          background:"white",
          marginTop:"20px",
          borderCollapse:"collapse"
        }}
      >

        <thead>

          <tr>

            <th>ID</th>

            <th>Waste</th>

            <th>Ward</th>

            <th>Status</th>

            <th>Days</th>

          </tr>

        </thead>

        <tbody>

          <tr>

            <td>#101</td>

            <td>Plastic</td>

            <td>Ward 12</td>

            <td>Pending</td>

            <td>3</td>

          </tr>

          <tr>

            <td>#102</td>

            <td>Mixed Waste</td>

            <td>Ward 25</td>

            <td>Resolved</td>

            <td>0</td>

          </tr>

          <tr>

            <td>#103</td>

            <td>Construction</td>

            <td>Ward 40</td>

            <td>In Progress</td>

            <td>5</td>

          </tr>

        </tbody>

      </table>

    </div>

  );

}